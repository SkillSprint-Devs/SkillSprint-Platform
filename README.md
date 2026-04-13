# SkillSprint Platform

**SkillSprint** is a comprehensive collaborative learning and developer networking platform that empowers developers to connect, learn, and grow together. Built with Node.js, Express, MongoDB, and Socket.IO, it combines real-time collaboration tools, intelligent matchmaking, skill-based quizzes, live sessions, and social features — all in one unified platform.

## Key Features

### Collaboration
- **Pair Programming** — Live, invite-based code collaboration sessions with real-time sync.
- **Interactive Whiteboard** — Collaborative drawing and brainstorming with real-time multi-user presence, color-coded cursors, and comment threads.
- **Live Sessions** — Host and join real-time video/audio collaboration sessions with session history tracking.

### Matchmaking & Discovery
- **Intelligent Matchmaking** — Algorithm-powered (KNN + Cosine Similarity) developer matching based on tech stack, learning goals, skill level, and experience to find ideal teammates or study partners.
- **Collaborations Feed** — Browse and connect with matched developers and ongoing projects.

### Learning & Growth
- **Quiz System** — Skill-based quizzes with multiple question types, timed attempts, scoring, and detailed attempt history.
- **Course Seeding** — Pre-seeded course library used to power matchmaking recommendations.
- **Achievements** — Unlock milestones and badges based on platform activity and quiz performance.
- **Certificates** — Generate and download certificates upon completing skill assessments.

### Productivity
- **Task Management** — Create, assign, and track tasks with calendar views, priority levels, and automated daily reminders (via cron).
- **Reminders** — Custom reminder system with Nodemailer-powered email alerts.

### Social & Communication
- **Real-time Chat** — Instant messaging with live notifications.
- **Social Feed** — Share posts, follow users, like and comment on content.
- **Public Profiles** — View other developers' profiles, skills, posts, library resources, and activity.
- **Following System** — Follow/unfollow users and track their activity.

### Content & Resources
- **Library** — Upload, organize, and share learning resources (PDFs, recordings, images) with a modal preview viewer before download.
- **Wallet** — Token-based reward system with transaction history tied to platform achievements and activity.

### Notifications
- **Smart Notifications** — Real-time alerts for all platform events including messages, task reminders, social interactions, board invitations, pair programming requests, and collaboration updates.

---

## Tech Stack

### Backend
- **Node.js** & **Express** — Server framework.
- **MongoDB** & **Mongoose** — Database and ODM.
- **Socket.IO** — Real-time bidirectional communication.
- **JWT** — Authentication and authorization.
- **node-cron** — Automated task and reminder scheduling.
- **Nodemailer** — Email notifications and reminders.
- **Multer** — File upload handling for library resources.

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
└── frontend/
    ├── assets/          # CSS and static assets
    ├── js/              # Client-side JavaScript modules
    └── *.html           # Page templates
```

---

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)

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

Run the entire platform using Docker:

```bash
docker-compose up
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
