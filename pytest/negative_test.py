import pytest
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


# 01. Добавление данных с пустым телом запроса
@pytest.mark.negative
def test_add_data_with_empty_body(headers):
    response = requests.post(
        f"{base_url}/data",
        json={},
        headers=headers
    )
    assert response.status_code == 400
    assert 'No text provided' in response.text

# 02. Обновление данных с пустым телом запроса
@pytest.mark.negative
def test_update_data_with_empty_body(headers):
    # Добавляем тестовые данные
    requests.post(f"{base_url}/data", json={'text': 'Test'}, headers=headers)

    response = requests.put(
        f"{base_url}/data/1",
        json={},
        headers=headers
    )
    assert response.status_code == 400
    assert 'No text provided' in response.text

# 03. Добавление данных с некорректным форматом текста
@pytest.mark.negative
def test_add_data_with_invalid_text_format(headers):
    # Пустая строка
    response = requests.post(
        f"{base_url}/data",
        json={'text': ''},
        headers=headers
    )
    assert response.status_code == 400
    assert 'empty or whitespace-only' in response.text

    # Строка из пробелов
    response = requests.post(
        f"{base_url}/data",
        json={'text': '   '},
        headers=headers
    )
    assert response.status_code == 400
    assert 'empty or whitespace-only' in response.text

    # Управляющие символы
    response = requests.post(
        f"{base_url}/data",
        json={'text': '\x00\x01\x02'},
        headers=headers
    )
    assert response.status_code == 400
    assert 'control characters only' in response.text

# 04. Обновление данных с некорректным форматом текста
@pytest.mark.negative
def test_update_data_with_invalid_text_format(headers):
    # Добавляем тестовые данные и получаем ID через GET-запрос
    requests.post(
        f"{base_url}/data",
        json={'text': 'Test'},
        headers=headers
    )

    # Получаем ID последней добавленной записи
    get_response = requests.get(f"{base_url}/data", headers=headers)
    item_id = get_response.json()[0]['id']

    # Пустая строка
    response = requests.put(
        f"{base_url}/data/{item_id}",
        json={'text': ''},
        headers=headers
    )
    assert response.status_code == 400
    assert 'empty or whitespace-only' in response.text

    # Строка из пробелов
    response = requests.put(
        f"{base_url}/data/{item_id}",
        json={'text': '   '},
        headers=headers
    )
    assert response.status_code == 400
    assert 'empty or whitespace-only' in response.text

    # Управляющие символы
    response = requests.put(
        f"{base_url}/data/{item_id}",
        json={'text': '\x00\x01\x02'},
        headers=headers
    )
    assert response.status_code == 400
    assert 'control characters only' in response.text

# 05. Получение данных по несуществующему ID
@pytest.mark.negative
def test_get_data_with_invalid_id(headers):
    response = requests.get(f"{base_url}/data/999", headers=headers)
    assert response.status_code == 404
    assert response.text == 'Data not found.'

# 06. Обновление данных по несуществующему ID
@pytest.mark.negative
def test_update_data_with_invalid_id(headers):
    response = requests.put(
        f"{base_url}/data/999",
        json={'text': 'Updated data'},
        headers=headers
    )
    assert response.status_code == 404
    assert response.text == 'Data not found.'

# 07. Удаление данных по несуществующему ID
@pytest.mark.negative
def test_delete_data_with_invalid_id(headers):
    response = requests.delete(f"{base_url}/data/999", headers=headers)
    assert response.status_code == 404
    assert response.text == 'Data not found.'

# 08. Отправка запроса с неверным методом HTTP
@pytest.mark.negative
def test_use_invalid_http_method(headers):
    response = requests.patch(f"{base_url}/data", headers=headers)
    assert response.status_code == 405
    assert "Method Not Allowed" in response.text

# 09. Отправка запроса на несуществующий эндпоинт
@pytest.mark.negative
def test_access_invalid_endpoint(headers):
    response = requests.get(f"{base_url}/invalid-endpoint", headers=headers)
    assert response.status_code == 404
    assert "Not Found" in response.text

# 10. Добавление данных, превышающих максимальную длину текста
@pytest.mark.negative
def test_add_data_exceeds_length(headers):
    text_101_chars = 'x' * 101
    response = requests.post(
        f"{base_url}/data",
        json={'text': text_101_chars},
        headers=headers
    )
    assert response.status_code == 400
    assert 'exceeds maximum allowed' in response.text
