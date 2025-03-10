import { test, expect } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { Severity } from 'allure-js-commons';

const baseUrl = 'http://localhost:5001';
const keycloakTokenUrl = 'http://localhost:4000/realms/master/protocol/openid-connect/token';

test.describe.serial('Negative API tests', () => {
  let accessToken: string;

  // Получение токена перед всеми тестами
  test.beforeAll(async ({ request }) => {
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
    return request[method](url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      data: data
    });
  };

  // Очистка БД перед каждым тестом
  test.beforeEach(async ({ request }) => {
    const response = await authRequest(request, 'delete', `${baseUrl}/data/all`);
    expect(response.status()).toBeTruthy();
  });

  test('01 - Add data with empty body @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Добавление данных с пустым телом запроса');
    await allure.severity(Severity.NORMAL);
    
    const response = await authRequest(request, 'post', `${baseUrl}/data`, {});
    expect(response.status()).toBe(400);
    expect(await response.text()).toBe('No text provided.');
  });

  test('02 - Update data with empty body @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Обновление данных с пустым телом запроса');
    await allure.severity(Severity.NORMAL);
    
    // Предусловие: Добавление данных для обновления
    await authRequest(request, 'post', `${baseUrl}/data`, {
      text: 'Initial data'
    });

    const response = await authRequest(request, 'put', `${baseUrl}/data/1`, {});
    expect(response.status()).toBe(400);
    expect(await response.text()).toBe('No text provided.');
  });

  test('03 - Add data with invalid text format @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Добавление данных с некорректным форматом текста');
    await allure.severity(Severity.NORMAL);
  
    const invalidTexts = [
      12345, // Число
      true,
      false,
      "", // Пустая строка
      " ", // Строка только с пробелом
      "\n", // Перенос строки
      "\t", // Табуляция
      "\r", // Возврат каретки
      "\f", // Перевод страницы
      "\v", // Вертикальная табуляция
      null, // Добавлено для проверки случая, когда text отсутствует
    ];
  
    for (const invalidText of invalidTexts) {
      // Отправка POST запроса с некорректным форматом текста
      const response = await authRequest(request, 'post', `${baseUrl}/data`, 
        invalidText === null ? {} : { text: invalidText }
      );
      
      // Проверка, что статус ответа равен 400
      expect(response.status()).toBe(400);
      // Проверка текста ответа
      const responseText = await response.text();
      
      if (invalidText === null) {
        expect(responseText).toBe('No text provided.');
      } else if (typeof invalidText !== 'string') {
        expect(responseText).toBe('Invalid text format.');
      } else if (invalidText.trim() === '') {
        expect(responseText).toBe('Invalid text format: empty or whitespace-only string.');
      } else if (invalidText.split('').every(char => char.charCodeAt(0) < 32)) {
        expect(responseText).toBe('Invalid text format: control characters only.');
      } else {
        expect(responseText).toBe('Invalid text format.');
      }
    }
  });

  test('04 - Update data with invalid text format @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Обновление данных с некорректным форматом текста');
    await allure.severity(Severity.MINOR);
  
    // Предусловие: Добавление данных для обновления
    await authRequest(request, 'post', `${baseUrl}/data`, {
      text: 'Initial data'
    });
  
    const invalidTexts = [
      12345, // Число
      true,
      false,
      "", // Пустая строка
      " ", // Строка только с пробелом
      "\n", // Перенос строки
      "\t", // Табуляция
      "\r", // Возврат каретки
      "\f", // Перевод страницы
      "\v", // Вертикальная табуляция
      null, // Отсутствие текста
      "a".repeat(101), // Строка длиннее 100 символов
    ];
  
    for (const invalidText of invalidTexts) {
      const response = await authRequest(request, 'put', `${baseUrl}/data/1`, 
        invalidText === null ? {} : { text: invalidText }
      );
      
      expect(response.status()).toBe(400);
      const responseText = await response.text();

      if (invalidText === null) {
        expect(responseText).toBe('No text provided.');
      } else if (typeof invalidText !== 'string') {
        expect(responseText).toBe('Invalid text format.');
      } else if (invalidText.trim() === '') {
        expect(responseText).toBe('Invalid text format: empty or whitespace-only string.');
      } else if (invalidText.split('').every(char => char.charCodeAt(0) < 32)) {
        expect(responseText).toBe('Invalid text format: control characters only.');
      } else if (invalidText.length > 100) {
        expect(responseText).toBe('Text length exceeds maximum allowed.');
      }
    }
  });

  test('05 - Get data with invalid ID @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Получение данных по несуществующему ID');
    await allure.severity(Severity.MINOR);

    const response = await authRequest(request, 'get', `${baseUrl}/data/9999`);
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe('Data not found.');
  });

  test('06 - Update data with invalid ID @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Обновление данных по несуществующему ID');
    await allure.severity(Severity.MINOR);

    const response = await authRequest(request, 'put', `${baseUrl}/data/9999`, {
      text: 'Updated text'
    });

    expect(response.status()).toBe(404);
    expect(await response.text()).toBe('Data not found.');
  });

  test('07 - Delete data with invalid ID @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Удаление данных по несуществующему ID');
    await allure.severity(Severity.MINOR);

    const response = await authRequest(request, 'delete', `${baseUrl}/data/9999`);
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe('Data not found.');
  });

  test('08 - Use invalid HTTP method @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Отправка запроса с неверным методом HTTP');
    await allure.severity(Severity.MINOR);

    const response = await request.patch(`${baseUrl}/data`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    expect(response.status()).toBe(405);
    expect(await response.text()).toContain('Method Not Allowed');
  });

  test('09 - Access invalid endpoint @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Отправка запроса на несуществующий эндпоинт');
    await allure.severity(Severity.MINOR);
  
    const response = await authRequest(request, 'get', `${baseUrl}/invalid-endpoint`);
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Not Found');
  });

  test('10 - Add data exceeds length @negative', async ({ request }) => {
    allure.label('owner', 'Anna');
    allure.label('tag', 'negative');
    await allure.description('Добавление данных, превышающих максимальную длину текста');
    await allure.severity(Severity.NORMAL);

    // Генерация строки длиной 200 символов (превышает лимит 100)
    const longText = 'x'.repeat(200);
    // Отправка POST запроса с чрезмерной длиной текста
    const response = await authRequest(request, 'post', `${baseUrl}/data`, {
      text: longText
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toBe('Text length exceeds maximum allowed.');
  });
});