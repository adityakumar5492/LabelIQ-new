CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE health_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE CASCADE,
    calorie_limit INTEGER,
    max_sugar_threshold DECIMAL(8,2),
    max_sodium_threshold DECIMAL(8,2),
    dietary_mode VARCHAR(50),
    analysis_strictness VARCHAR(20) NOT NULL DEFAULT 'moderate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ingredient_blocklist (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    ingredient_name VARCHAR(255) NOT NULL,

    reason VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, ingredient_name)
);

CREATE TABLE brands (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL UNIQUE,

    transparency_score DECIMAL(5,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE scanned_products (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    brand_id BIGINT
        REFERENCES brands(id) ON DELETE SET NULL,

    product_name VARCHAR(255),

    image_url TEXT,

    safety_grade VARCHAR(1),

    safety_score DECIMAL(5,2),

    declared_sugar DECIMAL(8,2),

    hidden_sugar_detected BOOLEAN NOT NULL DEFAULT FALSE,

    scan_status VARCHAR(30) NOT NULL DEFAULT 'completed',

    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nutrition_details (
    id BIGSERIAL PRIMARY KEY,

    scan_id BIGINT NOT NULL UNIQUE
        REFERENCES scanned_products(id) ON DELETE CASCADE,

    serving_size VARCHAR(100),

    servings_per_container DECIMAL(8,2),

    calories DECIMAL(8,2),

    protein_g DECIMAL(8,2),

    carbohydrates_g DECIMAL(8,2),

    total_fat_g DECIMAL(8,2),

    saturated_fat_g DECIMAL(8,2),

    trans_fat_g DECIMAL(8,2),

    dietary_fiber_g DECIMAL(8,2),

    total_sugars_g DECIMAL(8,2),

    added_sugars_g DECIMAL(8,2),

    sodium_mg DECIMAL(8,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ingredients (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL UNIQUE,

    category VARCHAR(100),

    risk_level VARCHAR(20),

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scan_ingredients (
    id BIGSERIAL PRIMARY KEY,

    scan_id BIGINT NOT NULL
        REFERENCES scanned_products(id) ON DELETE CASCADE,

    ingredient_id BIGINT NOT NULL
        REFERENCES ingredients(id) ON DELETE CASCADE,

    ingredient_order INTEGER,

    detected_by VARCHAR(30) DEFAULT 'ocr',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (scan_id, ingredient_id)
);

CREATE TABLE analysis_results (
    id BIGSERIAL PRIMARY KEY,

    scan_id BIGINT NOT NULL UNIQUE
        REFERENCES scanned_products(id) ON DELETE CASCADE,

    safety_grade VARCHAR(1),

    safety_score DECIMAL(5,2),

    assessment VARCHAR(50),

    goal_alignment VARCHAR(50),

    confidence DECIMAL(5,2),

    key_findings TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE source_citations (
    id BIGSERIAL PRIMARY KEY,

    analysis_id BIGINT NOT NULL
        REFERENCES analysis_results(id) ON DELETE CASCADE,

    source_name VARCHAR(255) NOT NULL,

    source_type VARCHAR(50),

    title TEXT,

    url TEXT,

    citation_text TEXT,

    published_date DATE,

    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rule_matches (
    id BIGSERIAL PRIMARY KEY,

    analysis_id BIGINT NOT NULL
        REFERENCES analysis_results(id) ON DELETE CASCADE,

    ingredient_id BIGINT
        REFERENCES ingredients(id) ON DELETE SET NULL,

    rule_code VARCHAR(100) NOT NULL,

    rule_name VARCHAR(255) NOT NULL,

    matched_value TEXT,

    severity VARCHAR(20),

    explanation TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public';