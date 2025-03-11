import pytest
import psycopg2
import requests

# URL тестируемого API
base_url = "http://localhost:5001"

# Фикстура для получения токена доступа из Keycloak
@pytest.fixture(scope="session")
def access_token():
    token_url = "http://localhost:4000/realms/master/protocol/openid-connect/token"
    data = {
        'client_id': 'psql-api',
        'client_secret': 'bGz8Ga1xIU8P51srfNtlu5fLVIdoGJVZ',
        'grant_type': 'client_credentials'
    }
    response = requests.post(token_url, data=data)
    response.raise_for_status()  # Проверка на ошибки
    return response.json()['access_token']


# Фикстура для формирования заголовков с токеном
@pytest.fixture
def headers(access_token):
    return {'Authorization': f'Bearer {access_token}'}


# Фикстура для очистки базы данных перед всеми тестами
@pytest.fixture(scope="session", autouse=True)
def clear_db(access_token):
    headers = {'Authorization': f'Bearer {access_token}'}
    requests.delete(f"{base_url}/data", headers=headers)


# 01. Получение данных из пустой таблицы
@pytest.mark.regress
def test_get_data_from_empty_table(headers):
    response = requests.get(f"{base_url}/data", headers=headers)
    assert response.status_code == 200
    assert response.json() == []

# 02. Добавление данных в таблицу
@pytest.mark.regress
def test_add_data(headers):
    response = requests.post(
        f"{base_url}/data",
        json={'text': 'Test data'},
        headers=headers
    )
    assert response.status_code == 200
    assert response.text == 'Data added successfully and sent to Kafka.'

# 03. Получение данных после добавления
@pytest.mark.regress
def test_get_data_after_add(headers):
    response = requests.get(f"{base_url}/data", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]['text'] == 'Test data'
    assert 'id' in data[0]  # Проверка наличия системных полей
    assert 'time' in data[0]

# 04. Обновление данных
@pytest.mark.regress
def test_update_data(headers):
    # Получаем ID добавленной записи
    response = requests.get(f"{base_url}/data", headers=headers)
    item_id = response.json()[0]['id']

    response = requests.put(
        f"{base_url}/data/{item_id}",
        json={'text': 'Updated data'},
        headers=headers
    )
    assert response.status_code == 200
    assert response.text == 'Data updated successfully and sent to Kafka.'

# 05. Получение обновленных данных
@pytest.mark.regress
def test_get_updated_data(headers):
    response = requests.get(f"{base_url}/data", headers=headers)
    item_id = response.json()[0]['id']

    response = requests.get(f"{base_url}/data/{item_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()['text'] == 'Updated data'

# 06. Удаление данных по ID
@pytest.mark.regress
def test_delete_data_by_id(headers):
    response = requests.get(f"{base_url}/data", headers=headers)
    item_id = response.json()[0]['id']

    response = requests.delete(f"{base_url}/data/{item_id}", headers=headers)
    assert response.status_code == 200
    assert response.text == 'Data deleted successfully and delete event sent to Kafka.'

# 07. Получение данных после удаления по ID
@pytest.mark.regress
def test_get_data_after_delete_by_id(headers):
    response = requests.get(f"{base_url}/data", headers=headers)
    assert response.status_code == 200
    assert response.json() == []

# 08. Удаление всех данных
@pytest.mark.regress
def test_delete_all_data(headers):
    # Добавляем тестовые данные
    [requests.post(f"{base_url}/data", json={'text': 'Test'}, headers=headers) for _ in range(20)]

    response = requests.delete(f"{base_url}/data", headers=headers)
    assert response.status_code == 200
    assert response.text == 'Table cleared and sequence reset.'

# 09. Получение данных после удаления всех данных
@pytest.mark.regress
def test_get_data_after_delete_all(headers):
    response = requests.get(f"{base_url}/data", headers=headers)
    assert response.status_code == 200
    assert response.json() == []

# 10. Проверка сброса sequence после полной очистки таблицы
@pytest.mark.regress
def test_sequence_reset_after_delete_all(headers):
    # 1. Добавляем тестовые данные
    for _ in range(20):
        response = requests.post(
            f"{base_url}/data",
            json={'text': 'Test'},
            headers=headers
        )
        assert response.status_code == 200

    # 2. Очищаем таблицу
    response = requests.delete(f"{base_url}/data", headers=headers)
    assert response.status_code == 200
    assert response.text == 'Table cleared and sequence reset.'

    # 3. Проверяем значение sequence через прямое подключение к PostgreSQL
    conn = None
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres",
            password="whatislove",
            host="localhost",
            port="5432"
        )
        cur = conn.cursor()

        # Выполняем запрос к sequence
        cur.execute("SELECT last_value FROM data_study_id_seq")
        result = cur.fetchone()

        # Проверяем значение sequence
        assert result[0] == 1, "Sequence не сброшен к 1 после очистки"

        cur.close()
    except Exception as e:
        pytest.fail(f"Ошибка подключения к PostgreSQL: {str(e)}")
    finally:
        if conn is not None:
            conn.close()

    # 4. Добавляем новую запись и проверяем ID
    response = requests.post(
        f"{base_url}/data",
        json={'text': 'New entry'},
        headers=headers
    )
    assert response.status_code == 200

    # Проверяем данные через API
    response = requests.get(f"{base_url}/data", headers=headers)
    data = response.json()

    assert len(data) == 1
    assert data[0]['id'] == 1, "ID первой записи после сброса должен быть 1"
    assert data[0]['text'] == 'New entry'

# 11. Добавление строки длиной 100 символов
@pytest.mark.regress
def test_add_data_with_100_char_text(headers):
    text_100_chars = 'x' * 100
    response = requests.post(
        f"{base_url}/data",
        json={'text': text_100_chars},
        headers=headers
    )
    assert response.status_code == 200
    assert response.text == 'Data added successfully and sent to Kafka.'

# 12. Добавление строк из всех возможных символов
@pytest.mark.regress
def test_add_data_with_all_characters(headers):
    allowed_chars = (
        "~!@#$%^&*()_+[]{}|\\:;\"'<>?,./-=0123456789"
        "QWERTYUIOPASDFGHJKLZXCVBNM"
        "qwertyuiopasdfghjklzxcvbnm"
        "ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ"
        "ёйцукенгшщзхъфывапролджэячсмитьбю"
    )
    # Очистка таблицы
    requests.delete(f"{base_url}/data", headers=headers)

    # Разделение строки на части по 100 символов
    part1, part2 = allowed_chars[:100], allowed_chars[100:200]

    # Добавление первой части
    response = requests.post(
        f"{base_url}/data",
        json={'text': part1},
        headers=headers
    )
    assert response.status_code == 200

    # Добавление второй части
    response = requests.post(
        f"{base_url}/data",
        json={'text': part2},
        headers=headers
    )
    assert response.status_code == 200

    # Проверка сохраненных данных
    response = requests.get(f"{base_url}/data", headers=headers)
    data = response.json()
    assert len(data) == 2
    assert {item['text'] for item in data} == {part1, part2}