# SkillSprint Platform

**SkillSprint** is a comprehensive collaborative learning and developer networking platform that empowers developers to connect, learn, and grow together. Built with Node.js, Express, MongoDB, and Socket.IO, it combines real-time collaboration tools, intelligent matchmaking, skill-based quizzes, live sessions, AI-driven assistance, and social features — all in one unified platform.

## Key Features

### Collaboration & Coding
- **Pair Programming** — Live, invite-based code collaboration sessions with real-time sync.
- **Code Execution Service** — Secure, sandboxed code execution environment supporting multiple languages (JavaScript, Python, PHP) via Docker containers.
- **Interactive Whiteboard** — Collaborative drawing and brainstorming with real-time multi-user presence, color-coded cursors, and comment threads.
- **Live Sessions** — Host and join real-time video/audio collaboration sessions with comprehensive session history tracking.

### Matchmaking & Discovery
- **Intelligent Matchmaking** — Algorithm-powered (KNN + Cosine Similarity) developer matching based on tech stack, learning goals, skill level, and experience to find ideal teammates or study partners.
- **Collaborations Feed** — Browse and connect with matched developers and ongoing projects.

### AI & Machine Learning
- **AI Assistant / Chatbot** — Integrated conversational AI engine providing semantic search, dynamic context retrieval, and intelligent assistance.
- **AI Training Interface** — Dedicated frontend (`ai-training.html`) to manage training datasets and fine-tune models.
- **Knowledge Base Management** — Automated scripts to generate, validate, consolidate, and update the AI knowledge base and semantic index.

### Learning & Growth
- **Quiz System** — Skill-based quizzes with multiple question types, timed attempts, scoring, and detailed attempt history.
- **Course Seeding** — Pre-seeded course library used to power matchmaking recommendations.
- **Achievements** — Unlock milestones and badges based on platform activity and quiz performance.
- **Certificates** — Generate and download certificates upon completing skill assessments.

### Social & Communication
- **Real-time Chat** — Instant messaging with live notifications.
- **Social Feed** — Share posts, follow users, like, and comment on content.
- **Public Profiles & Portfolios** — View other developers' profiles, skills, posts, library resources, and platform activity.
- **Following System** — Follow/unfollow users to tailor your social feed.

### Productivity & Personalization
- **Task Management** — Create, assign, and track tasks with calendar views, priority levels, and automated daily reminders.
- **Smart Reminders** — Custom reminder system with Nodemailer-powered email alerts and cron jobs.
- **User Dashboard & Onboarding** — Personalized dashboards and a guided onboarding flow (`getstarted.html`, `onboarding.html`) for a smooth user experience.
- **Custom Settings** — Extensive profile and notification preferences customization.

### Content & Economy
- **Library** — Upload, organize, and share learning resources (PDFs, recordings, images) with a modal preview viewer before download.
- **Wallet & Token System** — Token-based reward system with transaction history tied to platform achievements, content sharing, and general activity.

### Administration & Security
- **Admin Dashboard** — Comprehensive admin control panel for platform metrics and activity overview.
- **User Management** — Tools to monitor, manage, and debug user accounts (`admin-users.html`, `debug-user.html`).
- **System Health & Logs** — Real-time tracking of system health and error logs (`system-health.html`, `error-logs.html`).
- **Secure Authentication** — JWT-based authentication with OTP verification and secure password reset flows.
- **Smart Notifications** — Real-time alerts for messages, tasks, social interactions, and collaboration requests.

---

## Tech Stack

### Backend
- **Node.js** & **Express** — Core server framework.
- **MongoDB** & **Mongoose** — Database and Object Data Modeling (ODM).
- **Socket.IO** — Real-time bidirectional communication.
- **JWT** — Authentication and authorization.
- **node-cron** — Automated task and reminder scheduling.
- **Nodemailer** — Email notifications and reminders.
- **Multer** — File upload handling for library resources.

### AI Engine (Python)
- **Python 3** — Core language for AI services.
- **Sentence Transformers / Semantic Search** — For matching user queries and providing dynamic context.
- **Custom NLP Models** — Intent recognition and chatbot engine.

### Code Execution Service
- **Docker** — Containerized, isolated environments for safe code execution (`runners`).

### Frontend
- **HTML5**, **CSS3**, **Vanilla JavaScript** — Core web technologies.
- **Socket.IO Client** — Real-time updates and presence.
- **Responsive Design** — Mobile-friendly interface across all pages.

---

## Project Structure

```
SkillSprint-Platform/
├── backend/
│   ├── models/          # Mongoose data models
│   ├── routes/          # Express API routes
│   ├── services/        # Business logic (matchmaking, etc.)
│   ├── socket/          # Socket.IO event handlers
│   ├── utils/           # Helpers (task scheduler, notifications)
│   ├── middleware/      # Auth and error handling middleware
│   └── server.js        # Main server entry point
├── frontend/
│   ├── assets/          # CSS and static assets
│   ├── images/          # Image resources
│   ├── js/              # Client-side JavaScript modules
│   └── *.html           # Page templates (Admin, AI, Auth, Main features)
├── ai_engine/
│   ├── dataset/         # AI training datasets
│   ├── knowledge_base/  # Indexed knowledge base for semantic search
│   ├── models/          # Saved AI models
│   ├── semantic/        # Semantic search logic
│   └── app.py           # AI microservice entry point
└── execution-service/
    ├── runners/         # Dockerfiles for language runners
    ├── langConfig.js    # Supported languages configuration
    └── server.js        # Execution service entry point
```

---

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Python (v3.8 or higher) for AI Engine
- MongoDB (local or cloud instance)
- Docker (for Code Execution Service and full platform deployment)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/SkillSprint-Platform.git
   cd SkillSprint-Platform
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the `backend` directory:
   ```env
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   PORT=5000
   EMAIL_USER=your_email@example.com
   EMAIL_PASS=your_email_password
   ```

4. **Seed course data (optional)**
   ```bash
   node seedCourses.js
   ```

5. **Start the backend server**
   ```bash
   npm start
   ```

6. **Frontend Setup**
   Open `frontend/index.html` in your browser or serve it using a local server:
   ```bash
   cd ../frontend
   npx serve
   ```

---

## Docker Support

Run the entire platform, including the AI engine, execution service, backend, and frontend using Docker Compose:

```bash
docker-compose up --build
```

## Documentation

- [Pair Programming Guide](pair_programming_guide.md)
- [Pair Programming Audit](pair_programming_audit.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.

## Authors

SkillSprint Development Team
