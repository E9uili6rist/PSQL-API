from flask import Flask, jsonify, request, g
from flasgger import Swagger, swag_from
import psycopg
from confluent_kafka import Producer
import json
from keycloak import KeycloakOpenID
from functools import wraps
import logging
from keycloak.exceptions import KeycloakError
import config

# Инициализация Flask-приложения
app = Flask(__name__)
swagger = Swagger(app, template={
    "swagger": "2.0",
    "info": {
        "title": "API with Keycloak Authentication",
        "description": "API with Keycloak Authentication using Flask and Swagger",
        "version": "1.0.0"
    },
    "securityDefinitions": {
        "Bearer": {
            "type": "oauth2",
            "authorizationUrl": "http://localhost:4000/realms/master/protocol/openid-connect/auth",
            "tokenUrl": "http://localhost:4000/realms/master/protocol/openid-connect/token",
            "flow": "application"
        }
    },
    "security": [
        {
            "Bearer": []
        }
    ]
})

# Подключение к базе данных PostgreSQL
conn = psycopg.connect(
    dbname=config.POSTGRES_CONFIG['dbname'],
    user=config.POSTGRES_CONFIG['user'],
    password=config.POSTGRES_CONFIG['password'],
    host=config.POSTGRES_CONFIG['host'],
    port=config.POSTGRES_CONFIG['port']
)
cur = conn.cursor()

# Максимальная допустимая длина текста
MAX_TEXT_LENGTH = 100

# Создание таблицы, если она не существует
cur.execute("""
    CREATE TABLE IF NOT EXISTS public.data_study (
        id SERIAL PRIMARY KEY,
        text VARCHAR(100),
        time TIMESTAMP WITH TIME ZONE
    )
""")
conn.commit()

# Выполнение миграции, если таблица уже создана
cur.execute("""
    ALTER TABLE IF EXISTS public.data_study
    ALTER COLUMN text TYPE VARCHAR(100)
    USING text::VARCHAR(100)
""")
conn.commit()

# Инициализация Kafka producer
producer = Producer(config.KAFKA_CONFIG)

# Функция для отправки сообщений в Kafka
def send_to_kafka(topic, key, value):
    try:
        producer.produce(topic, key=key, value=json.dumps(value))
        producer.flush()
    except Exception as e:
        print(f"Ошибка при отправке в Kafka: {e}")

# Настройка Keycloak
keycloak_openid = KeycloakOpenID(
    server_url=config.KEYCLOAK_CONFIG['server_url'],
    client_id=config.KEYCLOAK_CONFIG['client_id'],
    realm_name=config.KEYCLOAK_CONFIG['realm_name'],
    client_secret_key=config.KEYCLOAK_CONFIG['client_secret_key']
)

# Настройка логгера
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Декоратор для проверки авторизации
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            logger.warning("Authorization header is missing")
            return jsonify({"message": "Authorization header is missing"}), 401

        try:
            # Проверяем, что заголовок содержит Bearer токен
            parts = auth_header.split()
            if parts[0].lower() != "bearer" or len(parts) != 2:
                logger.warning("Invalid token format")
                return jsonify({"message": "Invalid token format"}), 401

            token = parts[1]

            # Проверяем активность токена
            token_info = keycloak_openid.introspect(token)
            logger.info(f"Token Info: {token_info}")

            if not token_info.get('active'):
                logger.warning("Token is not active")
                return jsonify({"message": "Token is not active"}), 401

            # Сохраняем информацию о пользователе в контексте Flask
            g.user = token_info
            return f(*args, **kwargs)

        except KeycloakError as e:
            logger.error(f"Keycloak error: {str(e)}")
            return jsonify({"message": "Keycloak error: " + str(e)}), 401

        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return jsonify({"message": "Unexpected error: " + str(e)}), 401

    return decorated

# Маршрут для получения всех данных из таблицы
@app.route('/data', methods=['GET'])
@token_required
@swag_from({
    'responses': {
        200: {
            'description': 'List of data',
            'schema': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'integer'},
                        'text': {'type': 'string'},
                        'time': {'type': 'string', 'format': 'date-time'}
                    }
                }
            }
        }
    }
})
def get_data():
    with conn.cursor() as cur:
        cur.execute("SELECT id, text, time FROM public.data_study")
        rows = cur.fetchall()
        data = [{'id': row[0], 'text': row[1], 'time': row[2].isoformat()} for row in rows]
    return jsonify(data)

# Маршрут для добавления новых данных
@app.route('/data', methods=['POST'])
@token_required
@swag_from({
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'schema': {
                'type': 'object',
                'properties': {
                    'text': {'type': 'string'}
                }
            }
        }
    ],
    'responses': {
        200: {
            'description': 'Data added successfully'
        },
        400: {
            'description': 'No text provided, Invalid text format, or Text length exceeds maximum allowed'
        }
    }
})
def add_data():
    data = request.json
    text = data.get('text')

    if text is None:
        return 'No text provided.', 400

    if not isinstance(text, str):
        return 'Invalid text format.', 400

    if text.strip() == "":
        return 'Invalid text format: empty or whitespace-only string.', 400

    if all(ord(char) < 32 for char in text):
        return 'Invalid text format: control characters only.', 400

    if len(text) > MAX_TEXT_LENGTH:
        return 'Text length exceeds maximum allowed.', 400

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO public.data_study (text, time) VALUES (%s, CURRENT_TIMESTAMP) RETURNING id, time",
            (text,)
        )
        id, time = cur.fetchone()
    conn.commit()

    kafka_data = {
        'id': id,
        'text': text,
        'time': time.isoformat()
    }
    send_to_kafka('my-topic', str(id), kafka_data)
    return 'Data added successfully and sent to Kafka.', 200

# Маршрут для удаления всех данных из таблицы
@app.route('/data', methods=['DELETE'])
@token_required
@swag_from({
    'responses': {
        200: {
            'description': 'Table cleared and sequence reset'
        }
    }
})
def delete_data():
    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE public.data_study CASCADE")
        cur.execute("ALTER SEQUENCE public.data_study_id_seq RESTART WITH 1")
    conn.commit()
    return 'Table cleared and sequence reset.', 200

# Маршрут для получения данных по ID
@app.route('/data/<int:id>', methods=['GET'])
@token_required
@swag_from({
    'parameters': [
        {
            'name': 'id',
            'in': 'path',
            'type': 'integer',
            'required': True
        }
    ],
    'responses': {
        200: {
            'description': 'Data found',
            'schema': {
                'type': 'object',
                'properties': {
                    'id': {'type': 'integer'},
                    'text': {'type': 'string'},
                    'time': {'type': 'string', 'format': 'date-time'}
                }
            }
        },
        404: {
            'description': 'Data not found'
        }
    }
})

def get_data_by_id(id):
    with conn.cursor() as cur:
        cur.execute("SELECT id, text, time FROM public.data_study WHERE id = %s", (id,))
        row = cur.fetchone()
        if row:
            data = {'id': row[0], 'text': row[1], 'time': row[2].isoformat()}
            return jsonify(data), 200
        else:
            return 'Data not found.', 404

# Маршрут для обновления данных по ID
@app.route('/data/<int:id>', methods=['PUT'])
@token_required
@swag_from({
    'parameters': [
        {
            'name': 'id',
            'in': 'path',
            'type': 'integer',
            'required': True
        },
        {
            'name': 'body',
            'in': 'body',
            'schema': {
                'type': 'object',
                'properties': {
                    'text': {'type': 'string'}
                }
            }
        }
    ],
    'responses': {
        200: {
            'description': 'Data updated successfully'
        },
        400: {
            'description': 'No text provided, Invalid text format, or Text length exceeds maximum allowed'
        },
        404: {
            'description': 'Data not found'
        }
    }
})
def update_data(id):
    data = request.json
    text = data.get('text')

    if text is None:
        return 'No text provided.', 400

    if not isinstance(text, str):
        return 'Invalid text format.', 400

    if text.strip() == "":
        return 'Invalid text format: empty or whitespace-only string.', 400

    if all(ord(char) < 32 for char in text):
        return 'Invalid text format: control characters only.', 400

    if len(text) > MAX_TEXT_LENGTH:
        return 'Text length exceeds maximum allowed.', 400

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE public.data_study SET text = %s WHERE id = %s RETURNING time",
            (text, id)
        )
        result = cur.fetchone()
        if not result:
            return 'Data not found.', 404
        time = result[0]
    conn.commit()

    kafka_data = {
        'id': id,
        'text': text,
        'time': time.isoformat()
    }
    send_to_kafka('my-topic', str(id), kafka_data)
    return 'Data updated successfully and sent to Kafka.', 200

# Маршрут для удаления данных по ID
@app.route('/data/<int:id>', methods=['DELETE'])
@token_required
@swag_from({
    'parameters': [
        {
            'name': 'id',
            'in': 'path',
            'type': 'integer',
            'required': True
        }
    ],
    'responses': {
        200: {
            'description': 'Data deleted successfully and delete event sent to Kafka.'
        },
        404: {
            'description': 'Data not found'
        }
    },
    'security': [{'Bearer': []}]
})
def delete_data_by_id(id):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM public.data_study WHERE id = %s", (id,))
        deleted_rows = cur.rowcount
    conn.commit()

    if deleted_rows == 0:
        return 'Data not found.', 404

    kafka_data = {
        'id': id,
        'action': 'delete'
    }
    send_to_kafka('my-topic', str(id), kafka_data)
    return 'Data deleted successfully and delete event sent to Kafka.', 200

# Запуск Flask-приложения
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
