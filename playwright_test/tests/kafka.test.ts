import { test, expect } from '@playwright/test';
import { Kafka } from 'kafkajs';
import * as allure from "allure-js-commons";                           
import { Severity } from "allure-js-commons";                              

const baseUrl = 'http://localhost:5001';
const keycloakTokenUrl = 'http://localhost:4000/realms/master/protocol/openid-connect/token';

interface KafkaMessage {
  id?: number;
  text?: string;
  time?: string;
  action?: string;
}

test.describe.serial('API and Kafka integration tests', () => {
  const kafka = new Kafka({
    clientId: 'playwright-test',
    brokers: ['localhost:9093'],
  });
  const topic = 'my-topic';
  let consumer;
  let receivedMessages: KafkaMessage[] = [];          
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    // Получаем токен Keycloak
    const tokenResponse = await request.post(keycloakTokenUrl, {
      form: {
        client_id: 'psql-api',
        client_secret: 'bGz8Ga1xIU8P51srfNtlu5fLVIdoGJVZ',
        grant_type: 'client_credentials'
      }
    });
    
    expect(tokenResponse.ok()).toBeTruthy();
    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;

    // Настройка Kafka consumer
    consumer = kafka.consumer({ groupId: 'test-group' });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    // Запускаем прослушивание сообщений
    await consumer.run({
      eachMessage: async ({ message }) => {
        const value = message.value?.toString();
        if (value) {
          try {
            const parsedMessage = JSON.parse(value) as KafkaMessage;
            receivedMessages.push(parsedMessage);
          } catch (error) {
            console.error('Ошибка при парсинге сообщения:', error);
          }
        }
      },
    });
  });

  // Функция для авторизованных запросов
  const authRequest = async (request: any, method: string, url: string, data?: any) => {
    const response = await request[method](url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      data: data
    });
    
    if (!response.ok()) {
      console.log('------------------------------------------------');
      console.log(`Request FAILED: ${method} ${url}`);
      console.log('Status:', response.status());
      console.log('Headers:', response.headers());
      console.log('Body:', await response.text());
      console.log('------------------------------------------------');
    }
    
    return response;
  };

  test.beforeEach(async ({ request }) => {
    // Авторизация, очистка таблицы перед каждым тестом
    const deleteResponse = await authRequest(request, 'delete', `${baseUrl}/data`);
    expect(deleteResponse.ok()).toBeTruthy();
    // Очистка полученных сообщений перед каждым тестом
    receivedMessages = [];
  });

  test('01 - Receiving a message in Kafka about adding data @regress', async ({ request }) => {  
    allure.label('owner', 'Anna');                                      
    allure.label('tag', 'regress');                                                      
    await allure.description('Получение месседжа в Кафка о добавлении данных в БД');            
    await allure.severity(Severity.NORMAL);                              
    
    const testData = { text: 'Test data' };
    const response = await authRequest(request, 'post', `${baseUrl}/data`, testData);
    expect(response.ok()).toBeTruthy();

    // Ожидание получения сообщения в Kafka
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(receivedMessages.length).toBeGreaterThan(0);
    const lastMessage = receivedMessages[receivedMessages.length - 1];      
    expect(lastMessage.text).toBe(testData.text);

    // Проверка добавления данных в PostgreSQL
    const getResponse = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(getResponse.ok()).toBeTruthy();
    const data = await getResponse.json() as KafkaMessage[];
    const lastEntry = data[data.length - 1];
    expect(lastEntry.text).toBe(testData.text);
  });

  test('02 - Receiving a message in Kafka about updating data @regress', async ({ request }) => {
    allure.label('owner', 'Anna');                                         
    allure.label('tag', 'regress');                                   
    await allure.description('Получение месседжа в Кафка об обновлении данных в БД');              
    await allure.severity(Severity.NORMAL);  
    // Добавление данных для обновления
    const initialData = { text: 'Test data' };
    const postResponse = await authRequest(request, 'post', `${baseUrl}/data`, initialData);
    expect(postResponse.ok()).toBeTruthy();

    // Получаем ID созданной записи
    const getPostData = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(getPostData.ok()).toBeTruthy();
    const postData = await getPostData.json() as KafkaMessage[];
    const id = postData[postData.length - 1].id;

    // Используем полученный ID в запросах
    const updatedData = { text: 'Updated data' };
    const putResponse = await authRequest(request, 'put', `${baseUrl}/data/${id}`, updatedData);
    expect(putResponse.ok()).toBeTruthy();

    // Ожидание получения сообщения в Kafka
    await new Promise(resolve => setTimeout(resolve, 2000));

    //Должно быть два сообщения в Kafka: с 'Initial message' и 'New text message'
    expect(receivedMessages.length).toBeGreaterThan(1); 
    const lastMessage = receivedMessages[receivedMessages.length - 1];
    expect(lastMessage.text).toBe(updatedData.text);

    // Проверка обновления данных в PostgreSQL
    const getResponse = await authRequest(request, 'get', `${baseUrl}/data/${id}`);
    expect(getResponse.ok()).toBeTruthy();
    const data = await getResponse.json() as KafkaMessage;
    expect(data.text).toBe(updatedData.text);
  });

  test('03 - Receiving a message about deleting data in Kafka @regress', async ({ request }) => {
    allure.label('owner', 'Anna');                                         
    allure.label('tag', 'regress');                                   
    await allure.description('Получение месседжа в Кафка об удалении данных в БД');             
    await allure.severity(Severity.NORMAL); 
    // Добавление данных для удаления
    const initialData = { text: 'Message to delete' };
    const postResponse = await authRequest(request, 'post', `${baseUrl}/data`, initialData);
    expect(postResponse.ok()).toBeTruthy();
    // Получение ID добавленной записи
    const getPostData = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(getPostData.ok()).toBeTruthy();
    const postData = await getPostData.json() as KafkaMessage[];
    const id = postData[postData.length - 1].id;

    // Удаление данных через HTTP DELETE запрос
    const deleteResponse = await authRequest(request, 'delete', `${baseUrl}/data/${id}`);
    expect(deleteResponse.ok()).toBeTruthy();

    // Ожидание получения сообщения в Kafka
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(receivedMessages.length).toBeGreaterThan(0);
    const lastMessage = receivedMessages[receivedMessages.length - 1];
    expect(lastMessage.id).toBe(id);
    expect(lastMessage.action).toBe('delete');

    // Проверка удаления из PostgreSQL
    const getResponse = await authRequest(request, 'get', `${baseUrl}/data/${id}`);
    expect(getResponse.status()).toBe(404);
  });

  test.afterAll(async () => {
    // Отключаемся от Kafka consumer после всех тестов
    await consumer.disconnect();
  });
});