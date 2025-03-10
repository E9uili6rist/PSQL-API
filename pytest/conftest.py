import pytest

def pytest_collection_modifyitems(config, items):
    """Хук для модификации собранных тестовых элементов"""

    # Проходим по всем тестам с нумерацией
    for test_number, item in enumerate(items, start=1):
        # 1. Модифицируем отображаемое имя теста
        original_name = item.name  # Сохраняем оригинальное имя
        item.name = f"{test_number:02d}. {original_name}"

        # 2. Модифицируем nodeID (полный путь к тесту)
        original_nodeid = item.nodeid  # Пример: "test_api.py::test_get_data_empty"
        modified_nodeid = f"{test_number:02d}. {original_nodeid}"

        # # Используем внутренний атрибут
        item._nodeid = modified_nodeid  # Приватный атрибут! Может измениться в будущих версиях pytest

        # 3. (Опционально) Добавляем номер в пользовательские свойства
        item.user_properties.append(("test_number", test_number))