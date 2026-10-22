-- ============================================================
-- LABELIQ DATABASE SCHEMA
-- PostgreSQL / Supabase
-- ============================================================

-- ============================================================
-- 1. USERS
-- ============================================================

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. HEALTH PROFILES
-- ============================================================

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


-- ============================================================
-- 3. INGREDIENT BLOCKLIST
-- ============================================================

CREATE TABLE ingredient_blocklist (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    ingredient_name VARCHAR(255) NOT NULL,

    reason VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, ingredient_name)
);


-- ============================================================
-- 4. BRANDS
-- ============================================================

CREATE TABLE brands (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL UNIQUE,

    transparency_score DECIMAL(5,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. SCANNED PRODUCTS
-- ============================================================

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


-- ============================================================
-- 6. NUTRITION DETAILS
-- ============================================================

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


-- ============================================================
-- 7. INGREDIENTS
-- ============================================================

CREATE TABLE ingredients (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL UNIQUE,

    category VARCHAR(100),

    risk_level VARCHAR(20),

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 8. INGREDIENT RULES
-- ============================================================

CREATE TABLE ingredient_rules (
    id BIGSERIAL PRIMARY KEY,

    rule_code VARCHAR(100) NOT NULL UNIQUE,

    rule_name VARCHAR(255) NOT NULL,

    rule_type VARCHAR(50) NOT NULL,

    pattern VARCHAR(255) NOT NULL,

    severity VARCHAR(20) NOT NULL,

    score_penalty DECIMAL(5,2) NOT NULL DEFAULT 0,

    explanation TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 9. SCAN INGREDIENTS
-- ============================================================

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


-- ============================================================
-- 10. ANALYSIS RESULTS
-- ============================================================

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


-- ============================================================
-- 11. SOURCE CITATIONS
-- ============================================================

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


-- ============================================================
-- 12. RULE MATCHES
-- ============================================================

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


-- ============================================================
-- 13. UPDATED_AT TRIGGER
-- Automatically updates updated_at whenever a row changes
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER health_profiles_updated_at
BEFORE UPDATE ON health_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER brands_updated_at
BEFORE UPDATE ON brands
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER nutrition_details_updated_at
BEFORE UPDATE ON nutrition_details
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER ingredients_updated_at
BEFORE UPDATE ON ingredients
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER analysis_results_updated_at
BEFORE UPDATE ON analysis_results
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 14. INDEXES
-- ============================================================

CREATE INDEX idx_health_profiles_user_id
ON health_profiles(user_id);


CREATE INDEX idx_ingredient_blocklist_user_id
ON ingredient_blocklist(user_id);


CREATE INDEX idx_scanned_products_user_id
ON scanned_products(user_id);


CREATE INDEX idx_scanned_products_brand_id
ON scanned_products(brand_id);


CREATE INDEX idx_scanned_products_scanned_at
ON scanned_products(scanned_at DESC);


CREATE INDEX idx_scan_ingredients_scan_id
ON scan_ingredients(scan_id);


CREATE INDEX idx_scan_ingredients_ingredient_id
ON scan_ingredients(ingredient_id);


CREATE INDEX idx_analysis_results_scan_id
ON analysis_results(scan_id);


CREATE INDEX idx_source_citations_analysis_id
ON source_citations(analysis_id);


CREATE INDEX idx_rule_matches_analysis_id
ON rule_matches(analysis_id);


CREATE INDEX idx_rule_matches_ingredient_id
ON rule_matches(ingredient_id);


-- ============================================================
-- 15. SEED INGREDIENT RULES
-- ============================================================

INSERT INTO ingredient_rules (
    rule_code,
    rule_name,
    rule_type,
    pattern,
    severity,
    score_penalty,
    explanation
)
VALUES

(
    'ADDITIVE_E621',
    'MSG / Monosodium Glutamate',
    'ingredient',
    'E621',
    'medium',
    10,
    'Monosodium glutamate (MSG) detected in the ingredient list.'
),

(
    'ADDITIVE_E211',
    'Sodium Benzoate',
    'ingredient',
    'E211',
    'medium',
    10,
    'Sodium benzoate detected in the ingredient list.'
),

(
    'ADDITIVE_BHA',
    'BHA',
    'ingredient',
    'BHA',
    'high',
    15,
    'Butylated hydroxyanisole (BHA) detected in the ingredient list.'
),

(
    'SUGAR_GLUCOS_SYRUP',
    'Glucose Syrup',
    'hidden_sugar',
    'GLUCOSE SYRUP',
    'medium',
    10,
    'Glucose syrup detected in the ingredient list.'
),

(
    'SUGAR_MALTODEXTRIN',
    'Maltodextrin',
    'hidden_sugar',
    'MALTODEXTRIN',
    'medium',
    10,
    'Maltodextrin detected in the ingredient list.'
),

(
    'SUGAR_HFCS',
    'High Fructose Corn Syrup',
    'hidden_sugar',
    'HIGH FRUCTOSE CORN SYRUP',
    'high',
    15,
    'High-fructose corn syrup detected in the ingredient list.'
)

ON CONFLICT (rule_code) DO NOTHING;


-- ============================================================
-- SCHEMA COMPLETE
-- ============================================================