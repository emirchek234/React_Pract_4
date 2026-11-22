-- Гарантируем наличие системной категории «Без категории».
-- Её нельзя переименовать или удалить через API администратора.
INSERT INTO Categories (name)
SELECT 'Без категории'
WHERE NOT EXISTS (SELECT 1 FROM Categories WHERE LOWER(BTRIM(name)) = LOWER('Без категории'));

-- Переводим возможные NULL-ссылки на системную категорию.
UPDATE Services
SET category_id = (SELECT category_id FROM Categories WHERE LOWER(BTRIM(name)) = LOWER('Без категории') ORDER BY category_id LIMIT 1)
WHERE category_id IS NULL;
