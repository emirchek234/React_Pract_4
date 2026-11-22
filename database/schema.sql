-- Service Studio — схема базы данных веб-приложения магазина услуг.
-- Создайте базу: CREATE DATABASE service_store;
-- Затем выполните этот файл в базе service_store.

CREATE TABLE IF NOT EXISTS Roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(30) NOT NULL UNIQUE
);
INSERT INTO Roles (role_name) VALUES ('admin'), ('customer') ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS Categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_unique ON Categories (LOWER(BTRIM(name)));
INSERT INTO Categories (name) VALUES ('Без категории') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS Users (
    user_id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES Roles(role_id),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL DEFAULT '',
    default_address VARCHAR(250) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE Users ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE Users ADD COLUMN IF NOT EXISTS default_address VARCHAR(250) NOT NULL DEFAULT '';
ALTER TABLE Users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON Users (LOWER(email));

CREATE TABLE IF NOT EXISTS Services (
    service_id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES Categories(category_id),
    name VARCHAR(160) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 500),
    discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
    image_url TEXT,
    stock_quantity INTEGER NOT NULL DEFAULT 10 CHECK (stock_quantity >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE Services ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 10;
UPDATE Services SET category_id = (SELECT category_id FROM Categories WHERE LOWER(name) = LOWER('Без категории') LIMIT 1)
WHERE category_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_services_category ON Services(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS services_name_ci_unique ON Services (LOWER(BTRIM(name)));

CREATE TABLE IF NOT EXISTS UserCoupons (
    coupon_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES Users(user_id) ON DELETE CASCADE,
    coupon_type VARCHAR(30) NOT NULL,
    code VARCHAR(40) NOT NULL UNIQUE,
    discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by INTEGER REFERENCES Users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Серверная корзина: отдельный набор позиций на каждого пользователя.
CREATE TABLE IF NOT EXISTS CartItems (
    cart_item_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES Services(service_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_cartitems_user ON CartItems(user_id);

-- Один заказ содержит все позиции корзины, адрес, дату доставки и применённый купон.
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
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON PasswordResetCodes(user_id, created_at DESC);

-- Старые таблицы Appointments и Payments сохранены, чтобы не терять записи из предыдущей версии.
CREATE TABLE IF NOT EXISTS Appointments (
    appointment_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES Users(user_id),
    service_id INTEGER NOT NULL REFERENCES Services(service_id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    base_price NUMERIC(10, 2) NOT NULL,
    service_discount_percent INTEGER NOT NULL DEFAULT 0,
    coupon_discount_percent INTEGER NOT NULL DEFAULT 0,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS Payments (
    payment_id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL UNIQUE REFERENCES Appointments(appointment_id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(40) NOT NULL DEFAULT 'Не выбран',
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
