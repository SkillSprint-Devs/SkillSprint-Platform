import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  tags:        [{ type: String }],     // used for skill-based matching
  difficulty:  {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner',
  },
  link:        { type: String, default: '' },
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
export default Course;
