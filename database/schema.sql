CREATE TABLE IF NOT EXISTS Roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Users (
    user_id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES Roles(role_id),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Services (
    service_id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES Categories(category_id),
    name VARCHAR(160) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Одному пользователю соответствует не более одного активного персонального купона.
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

CREATE INDEX IF NOT EXISTS idx_services_category ON Services(category_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON Appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON Payments(appointment_id);
