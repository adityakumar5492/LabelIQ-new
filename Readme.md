# LabelIQ — Food Label Intelligence & Health Analytics Platform

> **Scan. Understand. Decide.**

LabelIQ is a full-stack AI-powered food label intelligence platform that analyzes food product labels from images and converts unstructured label information into structured nutrition, ingredient, allergen, and personalized health insights.

The platform combines **OCR, deterministic data extraction, RAG-based ingredient evidence, Groq AI, and rule-based health analysis** to provide reliable and explainable food-label analysis.

---

## 🚀 Features

### 📷 Food Label Scanning

Upload a food product label image and automatically extract:

- Product name
- Brand
- Pack size
- Serving size
- Servings per container
- Nutrition information
- Ingredients
- Allergen information

---

### 🔍 OCR-Based Extraction

LabelIQ uses OCR to extract information from food packaging.

The OCR pipeline includes:

- Image preprocessing
- Image resizing
- Grayscale conversion
- Thresholding
- Multiple OCR passes
- Nutrition-table focused OCR
- Cropped nutrition-region processing
- OCR result aggregation

This helps handle real-world food labels where text may be:

- Small
- Blurry
- Stylized
- Low contrast
- Partially obscured

---

### 🥗 Nutrition Extraction

LabelIQ extracts nutritional information such as:

- Calories
- Protein
- Carbohydrates
- Total fat
- Saturated fat
- Trans fat
- Dietary fibre
- Total sugars
- Added sugars
- Sodium
- Salt

The nutrition pipeline prioritizes deterministic OCR and table evidence over AI-generated values.

### Nutrition reliability

```text
Strong OCR / Table Evidence
          ↓
Validated Deterministic Parsing
          ↓
Groq AI Fallback
```

AI should not overwrite reliable deterministic nutrition data.

---

### 🧾 Ingredient Extraction

LabelIQ extracts and normalizes ingredient information from food labels.

The system supports:

- Ingredient normalization
- Ingredient aliases
- Ingredient percentages
- Nested ingredients
- Ingredient groups
- Ingredient-related notes
- Ingredient evidence retrieval

Example:

```text
Milk Chocolate (13%)
    ├── Sugar
    ├── Cocoa Butter
    ├── Skimmed Milk Powder
    ├── Cocoa Mass
    ├── Lactose
    ├── Whey
    ├── Palm Fat
    └── Emulsifier
         └── Soya Lecithin
```

---

### ⚠️ Allergen Detection

LabelIQ analyzes ingredients and allergen statements to identify potential allergens.

The system distinguishes between:

```text
Contains
```

and:

```text
May Contain
```

This prevents cross-contamination warnings from automatically being treated as confirmed ingredients.

Allergen detection can use evidence from multiple OCR passes to improve reliability.

---

### 🧠 Ingredient RAG

LabelIQ currently uses a structured local ingredient knowledge base.

```text
ingredient-knowledge.json
        ↓
RAG Service
        ↓
Ingredient Evidence
        ↓
Groq AI
        ↓
Contextual Explanation
```

The RAG layer provides ingredient-related evidence such as:

- Ingredient identity
- Aliases
- Ingredient category
- Potential concerns
- Supporting information

The current implementation uses a local JSON knowledge base.

> Vector databases and embedding-based retrieval are not currently part of the deployed LabelIQ architecture.

---

# 🤖 Groq AI Integration

LabelIQ uses **Groq API** for generative AI capabilities.

The current AI model used by the project is:

```text
openai/gpt-oss-20b
```

Groq is used for tasks such as:

- Product information fallback extraction
- Contextual ingredient explanations
- Product summaries
- Key findings
- Health-related explanations
- Natural-language interpretation

### AI reliability principle

The LLM does **not** determine the final health score.

Instead:

```text
OCR
 ↓
Deterministic Extraction
 ↓
Deterministic Health Rules
 ↓
Health Score + Grade
 ↓
Groq AI Explanation
```

This prevents the LLM from becoming the sole source of truth for critical health calculations.

---

# ❤️ Personalized Health Analysis

Users can maintain health preferences that are used during product analysis.

Supported profile information includes:

- Maximum calorie limit
- Maximum sugar limit
- Maximum sodium limit
- Dietary mode
- Analysis strictness

Supported dietary modes include:

- Vegan
- Gluten-free
- Keto
- Type-2 diabetic

The system evaluates extracted product information against the user's health profile.

---

# 📊 Deterministic Health Scoring

LabelIQ uses a rule-based health scoring system.

The score starts at:

```text
100
```

Penalties are applied when predefined rules are triggered.

The final score cannot go below:

```text
0
```

### Grade mapping

| Score | Grade |
|---:|:---:|
| 90–100 | A |
| 75–89 | B |
| 50–74 | C |
| 0–49 | D |

The scoring system can evaluate:

- Ingredient blocklist matches
- Calorie limits
- Sugar limits
- Sodium limits
- Dietary conflicts
- Ingredient rules

---

# 🏗️ System Architecture

```text
                         ┌──────────────────────┐
                         │     React / Vite     │
                         │      Frontend        │
                         └──────────┬───────────┘
                                    │
                                    │ REST API
                                    ▼
                         ┌──────────────────────┐
                         │   Node.js / Express  │
                         │       Backend        │
                         └──────────┬───────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │       AI Processing Layer    │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │ Image Preprocessing     │  │
                    │  │ Sharp                   │  │
                    │  └────────────┬───────────┘  │
                    │               ▼              │
                    │  ┌────────────────────────┐  │
                    │  │ OCR                    │  │
                    │  │ Tesseract.js           │  │
                    │  └────────────┬───────────┘  │
                    │               ▼              │
                    │  ┌────────────────────────┐  │
                    │  │ Deterministic          │  │
                    │  │ Extraction              │  │
                    │  └────────────┬───────────┘  │
                    │               ▼              │
                    │  ┌────────────────────────┐  │
                    │  │ Ingredient RAG          │  │
                    │  │ Local Knowledge Base    │  │
                    │  └────────────┬───────────┘  │
                    │               ▼              │
                    │  ┌────────────────────────┐  │
                    │  │ Groq AI API             │  │
                    │  │ GPT-OSS-20B             │  │
                    │  └────────────┬───────────┘  │
                    │               ▼              │
                    │  ┌────────────────────────┐  │
                    │  │ Deterministic Health    │  │
                    │  │ Rules / Scoring         │  │
                    │  └────────────────────────┘  │
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────┴──────────────┐
                    │                              │
                    ▼                              ▼
          ┌───────────────────┐          ┌───────────────────┐
          │ PostgreSQL        │          │ MongoDB Atlas     │
          │ Supabase          │          │ Processing Logs   │
          └───────────────────┘          └───────────────────┘
```

---

# 🔄 Scan Processing Pipeline

```text
User uploads image
        ↓
React Frontend
        ↓
POST /api/scan
        ↓
Multer
        ↓
Scan Controller
        ↓
Scan Service
        ↓
AI Pipeline
        ↓
Image Preprocessing
        ↓
Multiple OCR Passes
        ↓
Product Extraction
        ↓
Nutrition Extraction
        ↓
Ingredient Extraction
        ↓
Allergen Detection
        ↓
Ingredient RAG
        ↓
Groq AI
        ↓
Deterministic Health Rules
        ↓
Health Score + Grade
        ↓
PostgreSQL
        ↓
MongoDB Logs
        ↓
Final Scan Response
        ↓
React Scan Result
```

---

# 🧩 Technology Stack

## Frontend

- React.js
- Vite
- Tailwind CSS
- React Router
- Axios
- Recharts
- Lucide React

## Backend

- Node.js
- Express.js
- Multer
- Zod
- Helmet
- CORS
- Morgan

## Authentication

- Google Login
- Google OAuth-based authentication

> JWT-based authentication was previously used during development but has been removed from the current architecture.

## AI / OCR

- Tesseract.js
- Sharp
- Groq API
- `openai/gpt-oss-20b`

## RAG

- Local JSON knowledge base
- Custom ingredient normalization
- Custom retrieval logic

## Databases

- PostgreSQL
- Supabase
- MongoDB Atlas
- Mongoose

## Development Tools

- Git
- GitHub
- Postman
- VS Code

---

# 📁 Project Structure

```text
LabelIQ/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── context/
│   │   ├── hooks/
│   │   └── ...
│   │
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── src/
│   │   │
│   │   ├── ai/
│   │   │   ├── ocr/
│   │   │   ├── nutrition/
│   │   │   ├── extraction/
│   │   │   ├── rag/
│   │   │   ├── pipeline/
│   │   │   └── ...
│   │   │
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── validators/
│   │   ├── app.js
│   │   └── server.js
│   │
│   ├── package.json
│   └── ...
│
├── database/
│   ├── schema.sql
│   └── ...
│
├── docs/
│   └── ...
│
├── test-image.jpg
├── .gitignore
└── README.md
```

---

# 🗄️ Database Design

LabelIQ uses PostgreSQL/Supabase for structured application data.

Important tables include:

```text
users
    │
    └── health_profiles

ingredient_blocklist
ingredient_rules

brands
    │
    └── scanned_products
            │
            ├── nutrition_details
            ├── ingredients
            ├── scan_ingredients
            ├── analysis_results
            ├── source_citations
            └── rule_matches
```

### PostgreSQL

PostgreSQL stores:

- User information
- Health profiles
- Product information
- Nutrition information
- Ingredients
- Scan results
- Analysis results
- Health-rule matches
- Source/evidence information

### MongoDB Atlas

MongoDB is used for flexible processing and AI logs, including:

- OCR logs
- AI processing logs
- Processing information
- Other raw analysis data

---

# 🔐 Authentication

LabelIQ currently uses **Google Login** for user authentication.

Authentication flow:

```text
User
 ↓
Google Login
 ↓
Google Authentication
 ↓
Application Authentication
 ↓
User Account
 ↓
Protected Application Features
```

The application no longer uses the previous JWT-based authentication architecture.

---

# 🛡️ Security

The backend includes security measures such as:

- Google-based authentication
- Request validation with Zod
- Helmet security headers
- CORS configuration
- File upload validation
- Image MIME-type validation
- Upload size limits
- Environment variables for secrets

Sensitive credentials are not committed to Git.

---

# 🔌 API Overview

The backend exposes REST APIs for authentication, scanning, profiles, and related application functionality.

### Scan APIs

```text
GET  /api/scan/history
GET  /api/scan/:id
POST /api/scan
```

Important:

```text
/api/scan/history
```

is registered before:

```text
/api/scan/:id
```

so that `history` is not interpreted as an ID.

---

# 🧪 Testing

LabelIQ includes tests for important deterministic and AI-related functionality.

Examples include:

- Nutrition parsing
- OCR processing
- Health-rule scoring
- Grade boundaries
- Ingredient matching
- RAG retrieval

Example:

```bash
node src/ai/health/test-health-rules.js
```

Expected grade boundaries:

```text
100 → A
90  → A
89  → B
75  → B
74  → C
50  → C
49  → D
```

---

# 📷 Nutrition OCR Regression Testing

The project uses food-label images to test OCR and nutrition extraction.

Example:

```text
test-image.jpg
```

The nutrition parser is designed to handle OCR errors such as:

```text
349
169
006g
```

when they can be safely recovered using contextual evidence.

The parser validates relationships such as:

```text
saturated fat <= total fat
sugars <= carbohydrates
nutrition values >= 0
```

If a value cannot be reliably recovered, the system should prefer:

```text
null
```

rather than inventing a value.

---

# 🧠 Data Reliability Strategy

One of LabelIQ's core design principles is:

> **AI should assist interpretation, not become the sole source of truth.**

The system separates:

### Deterministic processing

Used for:

- Nutrition values
- Health score
- Health grade
- Rule matching
- Threshold validation

### RAG

Used for:

- Ingredient evidence
- Ingredient knowledge
- Supporting context

### Groq AI

Used for:

- Natural-language explanations
- Ingredient explanations
- Product summaries
- Key findings
- Contextual interpretation

This architecture reduces the risk of LLM hallucinations affecting critical health calculations.

---

# 📊 Health Analysis Architecture

The health analysis starts with:

```text
Score = 100
```

Rules apply penalties when conditions are triggered.

Example:

```text
100
 ↓
Ingredient rule match
 ↓
Penalty
 ↓
Sugar limit exceeded
 ↓
Penalty
 ↓
Sodium limit exceeded
 ↓
Penalty
 ↓
Final Score
```

The score is clamped to a minimum of:

```text
0
```

### Grade

```text
90–100 → A
75–89  → B
50–74  → C
0–49   → D
```

---

# 🌱 Dietary Modes

Current supported dietary modes include:

```text
vegan
gluten-free
keto
type-2-diabetic
```

The selected dietary mode can influence personalized health analysis.

---

# 🧾 Ingredient Rules

The current rule system includes examples such as:

```text
ADDITIVE_E621
ADDITIVE_E211
ADDITIVE_BHA
SUGAR_GLUCOS_SYRUP
SUGAR_MALTODEXTRIN
SUGAR_HFCS
```

These rules are used by the deterministic health analysis system.

---

# 🌐 Deployment

## Frontend

Deployed on **Vercel**.

Production:

```text
https://label-iq-new.vercel.app/
```

## Backend

Deployed on **Render**.

Production:

```text
https://labeliq-new.onrender.com
```

## Database

**Supabase PostgreSQL**

## Processing Logs

**MongoDB Atlas**

## AI

**Groq API**

---

# ⚙️ Environment Variables

## Backend

Create:

```text
server/.env
```

Example:

```env
PORT=5000

DATABASE_URL=your_supabase_postgresql_connection_string

MONGO_URI=your_mongodb_connection_string

GROQ_API_KEY=your_groq_api_key
```

Add any other environment variables required by the current authentication implementation.

Never commit the actual `.env` file.

---

# 💻 Local Development

## 1. Clone the repository

```bash
git clone https://github.com/adityakumar5492/labeliq.git
cd labeliq
```

---

## 2. Install backend dependencies

```bash
cd server
npm install
```

---

## 3. Configure backend

Create:

```text
server/.env
```

and add the required environment variables.

---

## 4. Start backend

```bash
npm run dev
```

The backend normally runs on:

```text
http://localhost:5000
```

---

## 5. Install frontend dependencies

Open another terminal:

```bash
cd client
npm install
```

---

## 6. Configure frontend

Create:

```text
client/.env
```

Example:

```env
VITE_API_URL=http://localhost:5000
```

---

## 7. Start frontend

```bash
npm run dev
```

---

# 🔄 Development Workflow

```text
1. Start backend
2. Start frontend
3. Login with Google
4. Configure health profile
5. Upload food label
6. Run OCR
7. Extract nutrition
8. Extract ingredients
9. Detect allergens
10. Retrieve ingredient evidence
11. Run deterministic health rules
12. Generate Groq explanation
13. Save scan
14. Display result
```

---

# 🧪 Example Analysis

For a food label containing:

```text
Sugar
Palm Oil
Maltodextrin
Sodium Benzoate
```

the processing pipeline becomes:

```text
OCR
 ↓
Ingredient Extraction
 ↓
Ingredient Normalization
 ↓
RAG Evidence
 ↓
Rule Matching
 ↓
Health Score
 ↓
Groq Explanation
```

The final result can contain:

```text
Product Information
Nutrition Information
Ingredients
Allergens
Health Score
Grade
Health Issues
AI Summary
Ingredient Explanations
```

---

# 📈 Current Development Status

### Completed

- [x] React frontend
- [x] Vite setup
- [x] Node.js backend
- [x] Express API
- [x] Google Login
- [x] PostgreSQL/Supabase integration
- [x] MongoDB Atlas integration
- [x] Image upload
- [x] OCR pipeline
- [x] Nutrition extraction
- [x] Ingredient extraction
- [x] Ingredient RAG
- [x] Groq AI integration
- [x] AI-generated explanations
- [x] Deterministic health rules
- [x] Personalized health profile
- [x] Health score
- [x] Health grade
- [x] Scan history
- [x] Production deployment
- [x] Frontend/backend production configuration

### Current Improvement Work

The current development focus is improving:

- Product-name extraction
- Nutrition OCR edge cases
- Ingredient normalization
- Allergen detection
- Sodium derivation
- AI fallback validation
- Backend scan-result mapping
- Frontend scan-result mapping

---

# 🔮 Future Improvements

Potential future improvements include:

- More robust nutrition-table detection
- Better difficult-label image processing
- Advanced ingredient normalization
- Expanded allergen ontology
- Better evidence/source management
- Automated OCR regression testing
- Improved product-name recognition
- Embedding-based retrieval
- Vector database integration
- Advanced RAG
- More personalized nutrition analysis
- Analytics dashboard
- Expanded automated testing

These are future improvements and are not currently part of the deployed architecture.

---

# 🧠 Design Philosophy

### 1. Deterministic where accuracy matters

Critical values such as nutrition and health scores should rely on deterministic logic whenever possible.

### 2. AI where interpretation matters

Groq AI is used for explanation and contextual understanding.

### 3. Evidence over assumptions

The system should only report information supported by OCR, structured data, RAG evidence, or validated rules.

### 4. Graceful uncertainty

If a value cannot be reliably extracted:

```text
null
```

is preferable to inventing a value.

### 5. Modular architecture

OCR, extraction, nutrition parsing, RAG, AI explanation, and health rules are separated so individual components can be improved independently.

---

# 👨‍💻 Author

**Aditya Kumar**

B.Tech — Information Technology

Chandigarh Engineering College

---

# 🔗 Project Links

### GitHub

https://github.com/adityakumar5492/labeliq

### Live Demo

https://label-iq-new.vercel.app/

### Backend

https://labeliq-new.onrender.com

---

# 📄 License

This project is currently developed as an academic and portfolio project.

An open-source license can be added if the project is later distributed publicly under a specific license.

---

## ⭐ Project Summary

LabelIQ combines:

```text
Full-Stack Development
        +
OCR
        +
Deterministic Data Extraction
        +
RAG
        +
Groq Generative AI
        +
Rule-Based Health Analysis
        +
Personalized Health Insights
```

to transform a food-label image into structured, explainable, and personalized food-health insights.

> **Scan. Understand. Decide.**
