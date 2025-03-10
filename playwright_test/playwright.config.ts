import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,   // workers: 1 для отключения параллельного выполнения тестов по тегу не сработало 
  reporter: [
    ['list'],               // Вывод в консоль
    ['allure-playwright'],  // Allure репорт
  ],
  use: {
    trace: 'on-first-retry',  // Трассировки включены при первом повторе
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});