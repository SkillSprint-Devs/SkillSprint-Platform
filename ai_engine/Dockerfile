FROM python:3.10-slim

WORKDIR /app

# Copy the AI engine source code into the container
COPY . .

# Train the ML models before starting the server
RUN python -m training.train_model

# Expose the port the AI engine runs on
EXPOSE 5050

# Start the AI Engine API
CMD ["python", "app.py"]
