-- Миграция Service Studio: запустите один раз в существующей БД service_store.
BEGIN;

INSERT INTO Roles (role_name) VALUES ('admin'), ('customer') ON CONFLICT (role_name) DO NOTHING;
INSERT INTO Categories (name) VALUES ('Без категории') ON CONFLICT DO NOTHING;

-- Объединяем старые категории, отличающиеся только регистром/пробелами.
-- Связанные услуги переводятся на одну категорию; системное имя сохраняется точно.
WITH ranked_categories AS (
    SELECT category_id,
           FIRST_VALUE(category_id) OVER (
             PARTITION BY LOWER(BTRIM(name))
             ORDER BY CASE WHEN name = 'Без категории' THEN 0 ELSE 1 END, category_id
           ) AS keeper_id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(BTRIM(name))
             ORDER BY CASE WHEN name = 'Без категории' THEN 0 ELSE 1 END, category_id
           ) AS row_number
    FROM Categories
)
UPDATE Services s SET category_id = r.keeper_id
FROM ranked_categories r
WHERE s.category_id = r.category_id AND r.row_number > 1;

WITH ranked_categories AS (
    SELECT category_id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(BTRIM(name))
             ORDER BY CASE WHEN name = 'Без категории' THEN 0 ELSE 1 END, category_id
           ) AS row_number
    FROM Categories
)
DELETE FROM Categories c USING ranked_categories r
WHERE c.category_id = r.category_id AND r.row_number > 1;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_unique ON Categories (LOWER(BTRIM(name)));

ALTER TABLE Users ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE Users ADD COLUMN IF NOT EXISTS default_address VARCHAR(250) NOT NULL DEFAULT '';
ALTER TABLE Users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON Users (LOWER(email));
ALTER TABLE Services ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 10;
CREATE UNIQUE INDEX IF NOT EXISTS services_name_ci_unique ON Services (LOWER(BTRIM(name)));

CREATE TABLE IF NOT EXISTS CartItems (
    cart_item_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES Services(service_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_cartitems_user ON CartItems(user_id);

CREATE TABLE IF NOT EXISTS Orders (
    order_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES Users(user_id),
    delivery_address VARCHAR(250) NOT NULL,
    delivery_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    coupon_code VARCHAR(40),
    coupon_discount_percent INTEGER NOT NULL DEFAULT 0,
    subtotal NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON Orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON Orders(created_at DESC);

CREATE TABLE IF NOT EXISTS OrderItems (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES Orders(order_id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES Services(service_id) ON DELETE SET NULL,
    service_name VARCHAR(160) NOT NULL,
    image_url TEXT,
    duration_minutes INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    base_price NUMERIC(10, 2) NOT NULL,
    service_discount_percent INTEGER NOT NULL DEFAULT 0,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orderitems_order ON OrderItems(order_id);

CREATE TABLE IF NOT EXISTS Reviews (
    review_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES Services(service_id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_service ON Reviews(service_id, created_at DESC);

CREATE TABLE IF NOT EXISTS PasswordResetCodes (
    reset_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE PasswordResetCodes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON PasswordResetCodes(user_id, created_at DESC);

COMMIT;
