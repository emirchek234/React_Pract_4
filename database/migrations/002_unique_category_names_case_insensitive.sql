-- Запрещает дубли категорий без учёта регистра и пробелов по краям.
-- Сначала проверяем существующие данные: миграция не удаляет и не объединяет категории автоматически.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM Categories
        GROUP BY LOWER(BTRIM(name))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'В Categories уже есть дубли, отличающиеся регистром или пробелами. Сначала вручную объедините такие категории и перенесите связанные Services.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_unique
    ON Categories (LOWER(BTRIM(name)));
