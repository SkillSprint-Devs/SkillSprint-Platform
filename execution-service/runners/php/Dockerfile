# SkillSprint PHP Runner
# Minimal, non-root, read-only compatible image
FROM php:8.3-cli-alpine

# Create a non-root user to run code
RUN addgroup -S runner && adduser -S runner -G runner

# Install common PHP tools
RUN apk add --no-cache \
    bash \
    git \
    gettext \
    icu-data-full \
    tzdata \
    && docker-php-ext-configure intl \
    && docker-php-ext-install \
    pdo pdo_mysql mysqli intl bcmath opcache

# Create working dir
RUN mkdir -p /workspace

# Copy helper scripts
COPY scripts/* /usr/local/bin/

# Switch to non-root
USER runner
WORKDIR /workspace
