# SkillSprint Platform

**SkillSprint** is a comprehensive collaborative learning platform that empowers developers to connect, learn, and grow together. Built with Node.js, Express, MongoDB, and Socket.IO, it features real-time chat, task management, interactive whiteboards, pair programming sessions, social posting, and intelligent notifications—all designed for seamless team collaboration.

## Key Features

- **Real-time Chat** - Instant messaging with live notifications
- **Task Management** - Create, assign, and track tasks with calendar views and automated reminders
- **Interactive Whiteboard** - Collaborative drawing and brainstorming with real-time sync
- **Pair Programming** - Live code collaboration with invite-based sessions
- **Social Feed** - Share posts, follow users, like and comment on content
- **Smart Notifications** - Real-time alerts for all platform activities
- **User Profiles** - Customizable profiles with achievements and activity tracking

## Tech Stack

### Backend
- **Node.js** & **Express** - Server framework
- **MongoDB** & **Mongoose** - Database and ODM
- **Socket.IO** - Real-time bidirectional communication
- **JWT** - Authentication and authorization
- **node-cron** - Automated task reminders
- **Nodemailer** - Email notifications

### Frontend
- **HTML5**, **CSS3**, **JavaScript** - Core web technologies
- **Socket.IO Client** - Real-time updates
- **Responsive Design** - Mobile-friendly interface

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
   ```

4. **Start the Backend Server**
   ```bash
   npm start
   ```

5. **Frontend Setup**
   
   Open `frontend/index.html` in your browser or serve it using a local server:
   ```bash
   cd ../frontend
   npx serve
   ```

## Docker Support

Run the entire platform using Docker:

```bash
docker-compose up
```

## Documentation

- [Pair Programming Guide](pair_programming_guide.md)
- [Pair Programming Audit](pair_programming_audit.md)

## Usage

1. **Sign Up/Login** - Create an account or log in
2. **Explore Dashboard** - Access all features from the central dashboard
3. **Connect** - Chat with users, follow developers, and share posts
4. **Collaborate** - Start pair programming sessions or whiteboard brainstorming
5. **Manage Tasks** - Create and track your learning goals and deadlines

## Notification System

The platform features a comprehensive notification system that alerts users for:
- New messages and chat activity
- Task assignments, updates, and reminders (daily at 9:00 AM)
- Social interactions (likes, follows, comments)
- Board and pair programming invitations
- Permission changes and collaborator updates

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.

## Authors

SkillSprint Development Team
