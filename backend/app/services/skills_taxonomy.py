"""
Skills Taxonomy for ATS Keyword Matching

Contains:
- SKILL_SYNONYMS: Maps variations to canonical form
- SKILL_CATEGORIES: Groups skills by category for better matching
"""

# Maps skill variations to canonical form
# Key: canonical form, Value: list of variations
SKILL_SYNONYMS = {
    # Programming Languages
    "python": ["python3", "python 3", "py"],
    "javascript": ["js", "es6", "es2015", "ecmascript"],
    "typescript": ["ts"],
    "java": [],
    "c++": ["cpp", "c plus plus"],
    "c#": ["csharp", "c sharp"],
    "golang": ["go lang", "go"],
    "rust": [],
    "ruby": [],
    "php": [],
    "swift": [],
    "kotlin": [],
    "scala": [],
    "r": ["r lang", "rlang"],
    
    # Frontend
    "react": ["react.js", "reactjs", "react js"],
    "angular": ["angular.js", "angularjs", "angular 2+"],
    "vue": ["vue.js", "vuejs", "vue js"],
    "next.js": ["nextjs", "next js", "next"],
    "svelte": ["sveltejs"],
    "html": ["html5"],
    "css": ["css3", "cascading style sheets"],
    "sass": ["scss"],
    "tailwind": ["tailwindcss", "tailwind css"],
    "bootstrap": [],
    
    # Backend
    "node.js": ["nodejs", "node js", "node"],
    "express": ["express.js", "expressjs"],
    "django": [],
    "flask": [],
    "fastapi": ["fast api"],
    "spring": ["spring boot", "springboot"],
    "rails": ["ruby on rails", "ror"],
    "laravel": [],
    ".net": ["dotnet", "dot net", "asp.net"],
    
    # Databases
    "sql": ["structured query language"],
    "postgresql": ["postgres", "psql"],
    "mysql": ["my sql"],
    "mongodb": ["mongo", "mongo db"],
    "redis": [],
    "elasticsearch": ["elastic search", "elastic"],
    "dynamodb": ["dynamo db", "dynamo"],
    "firebase": ["firestore"],
    "sqlite": [],
    "oracle": ["oracle db"],
    "cassandra": [],
    
    # Cloud & DevOps
    "aws": ["amazon web services", "amazon aws"],
    "azure": ["microsoft azure", "ms azure"],
    "gcp": ["google cloud", "google cloud platform"],
    "docker": ["containerization"],
    "kubernetes": ["k8s", "kube"],
    "terraform": [],
    "ansible": [],
    "jenkins": [],
    "ci/cd": ["cicd", "ci cd", "continuous integration", "continuous deployment"],
    "github actions": ["gh actions"],
    "gitlab ci": ["gitlab-ci"],
    
    # Data & ML
    "machine learning": ["ml", "machine-learning"],
    "deep learning": ["dl", "deep-learning"],
    "tensorflow": ["tf"],
    "pytorch": ["torch"],
    "pandas": [],
    "numpy": [],
    "scikit-learn": ["sklearn", "scikit learn"],
    "keras": [],
    "nlp": ["natural language processing"],
    "computer vision": ["cv"],
    "data science": ["datascience", "data-science"],
    "data analysis": ["data analytics", "data-analysis", "analytics"],
    "data engineering": [],
    "spark": ["apache spark", "pyspark"],
    "hadoop": [],
    "airflow": ["apache airflow"],
    "statistics": ["statistical analysis", "statistical modeling"],
    "data visualization": ["data viz", "visualization"],
    "tableau": [],
    "power bi": ["powerbi", "power-bi"],
    "excel": ["microsoft excel", "ms excel"],
    "looker": [],
    "etl": ["extract transform load"],
    "data pipeline": ["data pipelines", "data-pipeline"],
    "data warehouse": ["data warehousing", "dwh"],
    "data modeling": ["data-modeling"],
    "snowflake": [],
    "databricks": [],
    "bigquery": ["big query", "google bigquery"],
    
    # Tools & Practices
    "git": ["github", "gitlab", "version control"],
    "agile": ["agile methodology", "agile development", "scrum", "kanban"],
    "scrum": ["scrum master"],
    "kanban": [],
    "jira": ["atlassian jira"],
    "confluence": [],
    "figma": [],
    "rest api": ["restful", "rest apis", "restful api"],
    "graphql": ["graph ql"],
    "microservices": ["micro services"],
    "api": ["apis", "api development", "rest api", "restful api"],
    "linux": ["unix"],
    "bash": ["shell", "shell scripting"],
    
    # Finance & Business
    "financial modeling": ["financial-modeling"],
    "financial analysis": ["financial-analysis"],
    "bloomberg": ["bloomberg terminal"],
    "trading": [],
    "risk management": ["risk-management"],
    "quantitative analysis": ["quant", "quantitative"],
    "fintech": ["fin-tech"],
    
    # Cloud & Infrastructure (expand)
    "cloud computing": ["cloud", "cloud services"],
    "serverless": ["lambda", "cloud functions"],
    "database": ["databases", "db"],
    
    # Soft Skills (less important for keyword matching but included)
    "leadership": ["team lead", "team leader"],
    "communication": ["written communication", "verbal communication"],
    "problem solving": ["problem-solving", "analytical thinking"],
    "teamwork": ["collaboration", "team player", "collaborative"],
    "project management": ["pm", "project-management"],
}

# Reverse lookup: variation -> canonical
VARIATION_TO_CANONICAL = {}
for canonical, variations in SKILL_SYNONYMS.items():
    VARIATION_TO_CANONICAL[canonical.lower()] = canonical
    for var in variations:
        VARIATION_TO_CANONICAL[var.lower()] = canonical

# Skill categories for context-aware matching
SKILL_CATEGORIES = {
    "programming_languages": [
        "python", "javascript", "typescript", "java", "c++", "c#", 
        "golang", "rust", "ruby", "php", "swift", "kotlin", "scala", "r"
    ],
    "frontend": [
        "react", "angular", "vue", "next.js", "svelte", "html", "css",
        "sass", "tailwind", "bootstrap"
    ],
    "backend": [
        "node.js", "express", "django", "flask", "fastapi", "spring",
        "rails", "laravel", ".net"
    ],
    "databases": [
        "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
        "dynamodb", "firebase", "sqlite", "oracle", "cassandra"
    ],
    "cloud_devops": [
        "aws", "azure", "gcp", "docker", "kubernetes", "terraform",
        "ansible", "jenkins", "ci/cd", "github actions", "gitlab ci"
    ],
    "data_ml": [
        "machine learning", "deep learning", "tensorflow", "pytorch",
        "pandas", "numpy", "scikit-learn", "keras", "nlp", "computer vision",
        "data science", "data analysis", "data engineering", "spark", "hadoop", "airflow"
    ],
    "tools_practices": [
        "git", "agile", "scrum", "kanban", "jira", "confluence", "figma", "rest api",
        "graphql", "microservices", "api", "linux", "bash", "project management"
    ],
    "finance_business": [
        "financial modeling", "financial analysis", "bloomberg", "trading",
        "risk management", "quantitative analysis", "fintech"
    ],
    "cloud_infrastructure": [
        "cloud computing", "serverless", "database"
    ],
}


def get_canonical_skill(skill: str) -> str:
    """Get canonical form of a skill, or return original if not found."""
    return VARIATION_TO_CANONICAL.get(skill.lower().strip(), skill.lower().strip())


def get_skill_category(skill: str) -> str | None:
    """Get the category a skill belongs to."""
    canonical = get_canonical_skill(skill)
    for category, skills in SKILL_CATEGORIES.items():
        if canonical in skills:
            return category
    return None

