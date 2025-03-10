import { test, expect } from '@playwright/test';
import * as allure from "allure-js-commons";
import { Severity } from "allure-js-commons";

const baseUrl = 'http://localhost:5001';
const keycloakTokenUrl = 'http://localhost:4000/realms/master/protocol/openid-connect/token';

test.describe.serial('API tests', () => {
  let accessToken: string;
  let testId: number;

  test.beforeAll(async ({ request }) => {
    // Получаем токен Keycloak перед всеми тестами
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
  });

  // Общая функция для авторизованных запросов
  const authRequest = async (request: any, method: string, url: string, data?: any) => {
    const response = await request[method](url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      data: data,
      timeout: 60000 // Увеличение таймаута до 60 секунд
    });
  
    // Дебаг-логирование
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

  test('01 - Get data from empty table @regress', async ({ request }) => {   
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');
    await allure.description('Получение данных из пустой таблицы');
    await allure.severity(Severity.CRITICAL);
    
    // Очистка таблицы
    await authRequest(request, 'delete', `${baseUrl}/data`);
    
    const response = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(response.ok()).toBeTruthy();     // Оба варианта правильны, но response.ok() проверяет, что статус код находится в диапазоне успешных ответов (200-299), тогда как response.status() проверяет конкретный код. Если важно знать именно конкретный статус, лучше использовать expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test('02 - Add data @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Добавление данных в таблицу');
    await allure.severity(Severity.BLOCKER);
    
    const response = await authRequest(request, 'post', `${baseUrl}/data`, {
      text: 'Test data'
    });
    
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toBe('Data added successfully and sent to Kafka.');
  });

  test('03 - Get data after add @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Получение данных после добавления');
    await allure.severity(Severity.BLOCKER);
    
    const response = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.length).toBe(1);
    testId = data[0].id; // Сохраняем ID для последующих тестов
    expect(data[0].text).toBe('Test data');
  });

  test('04 - Update data @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Обновление данных');
    await allure.severity(Severity.CRITICAL);
    
    const response = await authRequest(request, 'put', `${baseUrl}/data/${testId}`, {
      text: 'Updated data'
    });
    
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toBe('Data updated successfully and sent to Kafka.');
  });

  test('05 - Get updated data @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Получение обновленных данных');
    await allure.severity(Severity.CRITICAL);
    
    const response = await authRequest(request, 'get', `${baseUrl}/data/${testId}`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.text).toBe('Updated data');
  });

  test('06 - Delete data by ID @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Удаление данных по ID');
    await allure.severity(Severity.CRITICAL);
    
    const response = await authRequest(request, 'delete', `${baseUrl}/data/${testId}`);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toBe('Data deleted successfully and delete event sent to Kafka.');
  });

  test('07 - Get data after delete by ID @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Получение данных после удаления по ID');
    await allure.severity(Severity.NORMAL);
    
    const response = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual([]);
  });

  test('08 - Delete all data @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Удаление всех данных');
    await allure.severity(Severity.NORMAL);
    
      // Добавление 20 тестовых данных
    for (let i = 0; i < 20; i++) {
      const response = await authRequest(request, 'post', `${baseUrl}/data`, { text: 'Test' });
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
    }

    const response = await authRequest(request, 'delete', `${baseUrl}/data`);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toBe('Table cleared and sequence reset.');
  });

  test('09 - Get data after delete all @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Получение данных после удаления всех данных');
    await allure.severity(Severity.NORMAL);
    
    const response = await authRequest(request, 'get', `${baseUrl}/data`);
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual([]);
  });

  test('10 - Add data with 100 char text @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Добавление строки длиной 100 символов');
    await allure.severity(Severity.MINOR);
    
    const text100Chars = 'x'.repeat(100);
    const response = await authRequest(request, 'post', `${baseUrl}/data`, {
      text: text100Chars
    });
    
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toBe('Data added successfully and sent to Kafka.');
  });

  test('11 - Add data with all characters @regress', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'regress');    
    await allure.description('Добавление строк из всех возможных символов');
    await allure.severity(Severity.MINOR);
    
    const characters1 = "~!@#$%^&*()_+[]{}|\\:;'<>?,./-=0123456789QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm";
    const characters2 = "ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБ\"Юёйцукенгшщзхъфывапролджэячсмитьбю";

    const response1 = await authRequest(request, 'post', `${baseUrl}/data`, { text: characters1 });
    expect(response1.ok()).toBeTruthy();
    expect(await response1.text()).toBe('Data added successfully and sent to Kafka.');

    const response2 = await authRequest(request, 'post', `${baseUrl}/data`, { text: characters2 });
    expect(response2.ok()).toBeTruthy();
    expect(await response2.text()).toBe('Data added successfully and sent to Kafka.');
  });

test('12 - Sequence reset after delete all data @regress', async ({ request }) => {
  allure.label('owner', 'Anna');
  allure.label('tag', 'regress');
  await allure.description('Проверка сброса sequence после удаления всех данных');
  await allure.severity(Severity.CRITICAL);

  // 1. Добавляем несколько записей
  for (let i = 0; i < 20; i++) {
    await authRequest(request, 'post', `${baseUrl}/data`, { text: 'Test' });
  }

  // 2. Очищаем таблицу
  await authRequest(request, 'delete', `${baseUrl}/data`);

  // 3. Проверяем sequence через прямой запрос к PostgreSQL
  const { Client } = require('pg');   // библиотека Node.js для взаимодействия с БД PostgreSQL
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    dbname: 'postgres',
    password: 'whatislove',
    port: 5432,
  });

  try {
    await client.connect();

    const res = await client.query(
      'SELECT last_value FROM data_study_id_seq'
    );
    expect(Number(res.rows[0].last_value)).toBe(1);

  } finally {
    await client.end();
  }

  // 4. Добавляем новую запись и проверяем ID
  const postResponse = await authRequest(request, 'post', `${baseUrl}/data`, {
    text: 'New entry'
  });

  const getResponse = await authRequest(request, 'get', `${baseUrl}/data`);
  const data = await getResponse.json();
  expect(data[0].id).toBe(1);
});
});