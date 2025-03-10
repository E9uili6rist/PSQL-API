FROM python:3.9.5-slim

WORKDIR /app

COPY server.py .
COPY requirements.txt .

# Обновление pip + Копирование requirements.txt и установка зависимостей
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

CMD ["python", "server.py"]