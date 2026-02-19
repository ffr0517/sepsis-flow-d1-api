FROM rocker/r-ver:4.3.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libicu-dev \
    libsodium-dev \
    zlib1g-dev \
    pkg-config \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

RUN R -q -e "install.packages(c('plumber','jsonlite','httr2'), repos='https://cloud.r-project.org', Ncpus=parallel::detectCores()); stopifnot(requireNamespace('plumber', quietly=TRUE), requireNamespace('jsonlite', quietly=TRUE), requireNamespace('httr2', quietly=TRUE))"

WORKDIR /app
COPY services/orchestrator-api/api/plumber.R /app/plumber.R
COPY services/orchestrator-api/api/R /app/R

EXPOSE 8000

CMD ["R", "-e", "port <- as.integer(Sys.getenv('PORT', unset = '8000')); pr <- plumber::plumb('plumber.R'); pr$run(host='0.0.0.0', port=port)"]
