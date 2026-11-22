-- Запрещает повторное добавление активных услуг с одинаковыми названиями,
-- независимо от регистра и количества пробелов.
-- Удалённые из каталога (is_active = FALSE) услуги сохраняются для истории записей.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM Services
        WHERE is_active = TRUE
        GROUP BY LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g'))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'В Services уже есть активные дубли названий. Сначала переименуйте или деактивируйте дублирующиеся услуги.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS services_active_name_ci_unique
    ON Services (LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g')))
    WHERE is_active = TRUE;
