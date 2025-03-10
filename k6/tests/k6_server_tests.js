import http from 'k6/http';
import { check, group, fail } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
  ],
  thresholds: {
    http_req_duration: ['p(100)<5000'],
  },
};

const BASE_URL = 'http://localhost:5001';
const KEYCLOAK_URL = 'http://localhost:4000';

let authTokenCache = null;

function getAuthToken() {
  if (authTokenCache) return authTokenCache;

  const response = http.post(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      client_id: 'psql-api',
      client_secret: 'bGz8Ga1xIU8P51srfNtlu5fLVIdoGJVZ',
      grant_type: 'client_credentials',
    },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!check(response, { 'Authorization Success': (r) => r.status === 200 })) {
    fail('Failed to get token');
  }

  authTokenCache = response.json().access_token;
  return authTokenCache;
}

export function setup() {
  const token = getAuthToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Отправляем DELETE запрос
  const delResponse = http.del(`${BASE_URL}/data`, null, { headers });

  // Объединенная проверка для отчета
  const cleanupSuccess = check(delResponse, {
    'DELETE data before testing Success': (r) =>
      r.status === 200 &&
      r.body === 'Table cleared and sequence reset.'
  });

  if (!cleanupSuccess) {
    fail('DELETE data before testing Failed: ' + delResponse.body);
  }
}

export default function () {
  const token = getAuthToken();
  if (!token) {
    console.error('Authorization Failed');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let createdId = null;

  group('CRUD Cycle', () => {
    // POST data
    const postData = { text: `StressTest-${__VU}-${Date.now()}` };
    let postRes;
    try {
      postRes = http.post(
        `${BASE_URL}/data`,
        JSON.stringify(postData),
        { headers, timeout: '15s' }
      );
    } catch (e) {
      return;
    }

    check(postRes, {
      'POST data Success': (r) => r.status === 200,
    }) || console.log('POST data Failed:', postRes.body);

    if (postRes.status !== 200) return;


    // GET data
    let getRes;
    try {
      getRes = http.get(`${BASE_URL}/data`, { headers, timeout: '10s' });
    } catch (e) {
      return;
    }

    if (!check(getRes, { 'GET all data Success': (r) => r.status === 200 })) return;

    // Find created item
    const items = JSON.parse(getRes.body);
    const targetItem = items.find(i => i.text === postData.text);
    if (!targetItem) {
      console.log('Data not found.');
      return;
    }
    createdId = targetItem.id;


    // PUT data
    const putData = { text: `${postData.text}-UPDATED` };
    let putRes;
    try {
      putRes = http.put(
        `${BASE_URL}/data/${createdId}`,
        JSON.stringify(putData),
        { headers, timeout: '15s' }
      );
    } catch (e) {
      return;
    }

    check(putRes, {
      'PUT data Success': (r) => r.status === 200,
    }) || console.log('PUT data Failed:', putRes.body);


    // DELETE data
    let delRes;
    try {
      delRes = http.del(
        `${BASE_URL}/data/${createdId}`,
        null,
        { headers, timeout: '15s' }
      );
    } catch (e) {
      return;
    }

    check(delRes, {
      'DELETE data Success': (r) => r.status === 200,
    }) || console.log('DELETE data Failed:', delRes.body);
  });
}