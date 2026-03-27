import dotenv from "dotenv";
dotenv.config({ quiet: true });
import mongoose from "mongoose";
import Course from "./models/course.js";

const courses = [
  { title: "React for Beginners", description: "Learn the absolute basics of React, components, state, and props.", tags: ["React", "JavaScript", "Frontend", "Web"], difficulty: "Beginner", link: "https://react.dev/learn" },
  { title: "Advanced Node.js Patterns", description: "Master backend architecture, streams, and performance profiling with Node.js.", tags: ["Node.js", "Backend", "Architecture", "JavaScript"], difficulty: "Advanced", link: "https://nodejs.org" },
  { title: "UI/UX Design Fundamentals", description: "Learn the core principles of UI/UX design, wireframing, and interactive prototyping.", tags: ["Design", "UI", "UX", "Figma"], difficulty: "Beginner", link: "https://figma.com/resources" },
  { title: "Intro to Python for Data Science", description: "Get started with Python, Pandas, and data visualization techniques.", tags: ["Python", "Data Science", "Pandas", "Analytics"], difficulty: "Beginner", link: "https://python.org" },
  { title: "Fullstack Next.js and Vercel", description: "Build scalable, SEO-friendly applications with Next.js App Router.", tags: ["Next.js", "React", "Frontend", "Vercel", "Web"], difficulty: "Intermediate", link: "https://nextjs.org" },
  { title: "Machine Learning with TensorFlow", description: "Deep dive into building neural networks and machine learning models.", tags: ["Python", "TensorFlow", "Machine Learning", "AI"], difficulty: "Advanced", link: "https://tensorflow.org" },
  { title: "AWS Cloud Practitioner Mastery", description: "Learn the fundamentals of AWS cloud services, scaling, and deployment.", tags: ["AWS", "Cloud", "DevOps", "Infrastructure"], difficulty: "Intermediate", link: "https://aws.amazon.com/training/" },
  { title: "Mastering GraphQL APIs", description: "Design, build, and securely consume GraphQL APIs efficiently at scale.", tags: ["GraphQL", "API", "Backend", "Node.js"], difficulty: "Intermediate", link: "https://graphql.org/learn/" },
  { title: "Cybersecurity Basics", description: "Learn the fundamentals of network security, cryptography, and risk management.", tags: ["Security", "Cybersecurity", "Networking", "InfoSec"], difficulty: "Beginner", link: "https://www.cybrary.it/" },
  { title: "Docker and K8s Orchestration", description: "Containerize complex applications and orchestrate them efficiently with Kubernetes.", tags: ["Docker", "Kubernetes", "DevOps", "Containers"], difficulty: "Intermediate", link: "https://kubernetes.io/docs/tutorials/" }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB via", process.env.MONGO_URI.replace(/:([^:@]{1,})@/, ':****@'));

    await Course.deleteMany({});
    console.log("Cleared any existing courses");

    await Course.insertMany(courses);
    console.log(`Successfully seeded ${courses.length} courses!`);

    mongoose.disconnect();
    console.log("Disconnected.");
  } catch (err) {
    console.error("Failed to seed courses", err);
    process.exit(1);
  }
}

seed();
