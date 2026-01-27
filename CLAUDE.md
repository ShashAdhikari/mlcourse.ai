# CLAUDE.md - AI Assistant Guide for mlcourse.ai

This document provides comprehensive guidance for AI assistants working with the mlcourse.ai repository.

## Repository Overview

**mlcourse.ai** is an open Machine Learning course created by Yury Kashnitskiy (@yorko) and organized by OpenDataScience (ODS). It provides:

- 10-topic ML curriculum from fundamentals to advanced techniques
- 231 Jupyter notebooks (English and Russian versions)
- Practical assignments and Kaggle competitions
- Docker-based reproducible environment
- Community-contributed tutorials and student projects

**License**: CC BY-NC-SA 4.0 (Non-commercial, attribution required)

## Directory Structure

```
mlcourse.ai/
├── jupyter_english/              # English course materials
│   ├── topic01_pandas_data_analysis/
│   ├── topic02_visual_data_analysis/
│   ├── topic03_decision_trees_kNN/
│   ├── topic04_linear_models/
│   ├── topic05_ensembles_random_forests/
│   ├── topic06_features/
│   ├── topic07_unsupervised/
│   ├── topic08_sgd_hashing_vowpal_wabbit/
│   ├── topic09_time_series/
│   ├── topic10_boosting/
│   ├── assignments_demo/         # Practice assignments (10 total)
│   └── assignments_fall2018/     # Graded assignments
│
├── jupyter_russian/              # Russian course materials (extensive)
│   ├── topic01-10/               # Mirror of English topics
│   ├── tutorials/                # 50+ community tutorials
│   ├── competitions/             # Kaggle competition notebooks
│   ├── project_alice/            # Group project notebooks
│   └── projects_individual/      # 20+ student projects
│
├── data/                         # Datasets (40+ CSV files, ~71 MB)
├── img/                          # Images and diagrams (500+ files)
├── slides/                       # Course presentation slides
├── docker_files/                 # Docker configuration scripts
│
├── Dockerfile                    # Complete ML environment setup
├── run_docker_jupyter.py         # Docker launcher script
├── README.md                     # Course outline and links
├── CONTRIBUTING.md               # Contribution guidelines
└── LICENSE.md                    # CC BY-NC-SA 4.0
```

## Technology Stack

### Core Python Libraries
- **Data Processing**: pandas, numpy, scipy
- **Visualization**: matplotlib, seaborn, plotly, bokeh
- **Machine Learning**: scikit-learn, statsmodels

### Advanced ML Libraries
- **Gradient Boosting**: XGBoost, LightGBM, CatBoost
- **Deep Learning**: PyTorch (CPU), TensorFlow, Keras
- **Time Series**: Facebook Prophet (fbprophet)
- **Online Learning**: Vowpal Wabbit
- **Feature Engineering**: tsfresh, eli5

### System Dependencies
- Python 3
- Graphviz (for tree visualization)
- OpenJDK 8
- Boost libraries

## Development Workflows

### Running Notebooks Locally

**Using Docker (recommended)**:
```bash
python run_docker_jupyter.py
# Access Jupyter at http://localhost:4545
```

**Docker with custom options**:
```bash
python run_docker_jupyter.py --docker_tag festline/mlcourse_open --net_host
```

**Docker entry point commands**:
- `shell` - Interactive bash shell
- `jupyter` - Start Jupyter notebook server (port 4545)
- `h2o` - Start H2O server
- `zeppelin` - Start Zeppelin

### Validation
Use `docker_files/check_docker.ipynb` to verify the Docker environment is correctly set up.

### Without Docker
Install dependencies manually following the Dockerfile packages, then run:
```bash
jupyter notebook
```

## Course Topics

1. **Exploratory Data Analysis** - pandas fundamentals
2. **Visual Data Analysis** - matplotlib, seaborn, plotly
3. **Classification** - Decision trees, KNN
4. **Linear Models** - Regression, classification, regularization (5 parts)
5. **Ensembles** - Bagging, Random Forest, feature importance
6. **Feature Engineering** - Feature selection and transformation
7. **Unsupervised Learning** - PCA, clustering
8. **Online Learning** - SGD, Vowpal Wabbit
9. **Time Series** - Analysis with Prophet
10. **Gradient Boosting** - XGBoost, LightGBM, CatBoost

## Naming Conventions

### Notebooks
- English: `topic[##]_[description].ipynb`
- Parts: `topic04_part1_[description].ipynb`, `topic04_part2_[description].ipynb`
- Assignments: `assignment[##]_[description].ipynb`

### Data Files
- Descriptive names: `adult.data.csv`, `titanic_train.csv`, `flight_delays.csv`
- Located in `/data/` directory

### Topics
- Numbered 01-10 with descriptive suffixes
- Consistent naming across English and Russian versions

## Key Code Patterns

### Scikit-learn Transformers
Custom transformers inherit from `TransformerMixin`:
```python
from sklearn.base import TransformerMixin

class CustomTransformer(TransformerMixin):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        # transformation logic
        return X_transformed
```

### Common Imports
```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
```

### Visualization Patterns
```python
# Inline matplotlib in notebooks
%matplotlib inline

# Plotly offline mode
from plotly.offline import init_notebook_mode, iplot
init_notebook_mode(connected=True)
```

## Guidelines for AI Assistants

### When Working with Notebooks
1. **Preserve educational value** - Don't remove explanatory text or markdown cells
2. **Maintain multilingual support** - Be aware of English and Russian versions
3. **Keep exercises intact** - Don't solve assignment questions unless asked
4. **Respect notebook structure** - Topics are ordered pedagogically

### When Modifying Code
1. **Use standard ML libraries** - scikit-learn, pandas, numpy patterns
2. **Follow existing style** - Match the code style in surrounding cells
3. **Add clear comments** - Course materials should be educational
4. **Test with sample data** - Verify code works with provided datasets

### When Adding Content
1. **Follow topic numbering** - Place content in appropriate topic folder
2. **Use consistent naming** - Follow existing naming conventions
3. **Include markdown** - Explain concepts, not just code
4. **Reference external resources** - Link to Medium/Habr articles

### When Debugging
1. **Check data paths** - Data should be in `/data/` or loaded via URL
2. **Verify imports** - Ensure all required libraries are installed
3. **Consider Docker** - Some packages (VW, boosting) need specific setup
4. **Review notebook kernel** - Ensure Python 3 kernel is selected

### Data Handling
1. **Use relative paths** - Reference `../data/` from notebook directories
2. **Don't commit large files** - Check `.gitignore` for exclusions
3. **Preserve original data** - Create copies for transformations
4. **Document data sources** - Note where datasets originated

## Common Issues and Solutions

### Import Errors
- **Vowpal Wabbit**: Requires compilation from source (see Dockerfile)
- **XGBoost/LightGBM**: May need manual installation
- **Prophet**: Requires pystan as dependency

### Visualization Issues
- **Plotly not displaying**: Enable `init_notebook_mode(connected=True)`
- **Matplotlib not inline**: Add `%matplotlib inline` to notebook

### Memory Issues
- Large datasets (`athlete_events.csv`) are gitignored
- Use `head()` or sampling for exploration
- Consider chunked reading for large CSVs

## Contributing Guidelines

From CONTRIBUTING.md:
- **Typos**: Submit Pull Requests with description
- **Serious errors**: Open an Issue describing the problem
- **New content**: Contact @yorko via ODS Slack

## External Resources

- **Main site**: https://mlcourse.ai
- **Kaggle mirrors**: https://www.kaggle.com/kashnitsky/mlcourse
- **Medium articles**: https://medium.com/open-machine-learning-course
- **Habr (Russian)**: https://habr.com/company/ods/blog/344044/
- **Community**: OpenDataScience Slack (#mlcourse_ai channel)

## Quick Reference Commands

```bash
# Clone repository
git clone https://github.com/Yorko/mlcourse.ai.git

# Run with Docker
python run_docker_jupyter.py

# Build Docker image locally
docker build -t mlcourse_ai .

# Run specific Docker command
docker run -it --rm -p 4545:4545 -v "$(pwd)":/notebooks festline/mlcourse_open jupyter

# Check environment
jupyter nbconvert --execute docker_files/check_docker.ipynb
```
