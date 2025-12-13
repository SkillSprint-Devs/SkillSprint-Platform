import cron from 'node-cron';
import Task from '../models/task.js';
import Notification from '../models/notification.js';

/**
 * Task Reminder Scheduler
 * Runs daily at 9:00 AM to check for due and overdue tasks
 */
export function initTaskScheduler(io) {
    // Run every day at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('⏰ Running task reminder scheduler...');

        try {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);

            // Find tasks due today
            const tasksDueToday = await Task.find({
                dueDate: {
                    $gte: todayStart,
                    $lt: todayEnd
                },
                status: { $ne: 'completed' }
            }).populate('user', 'name');

            // Find overdue tasks
            const overdueTasks = await Task.find({
                dueDate: { $lt: todayStart },
                status: { $ne: 'completed' }
            }).populate('user', 'name');

            // Create notifications for tasks due today
            for (const task of tasksDueToday) {
                const notification = new Notification({
                    user_id: task.user,
                    title: 'Task Due Today',
                    message: `Your task "${task.title}" is due today`,
                    type: 'reminder',
                    link: '/task',
                });
                await notification.save();

                // Emit real-time notification
                if (io) {
                    io.to(task.user.toString()).emit('notification', notification);
                }
            }

            // Create notifications for overdue tasks
            for (const task of overdueTasks) {
                const notification = new Notification({
                    user_id: task.user,
                    title: 'Task Overdue',
                    message: `Your task "${task.title}" is overdue`,
                    type: 'reminder',
                    link: '/task',
                });
                await notification.save();

                // Emit real-time notification
                if (io) {
                    io.to(task.user.toString()).emit('notification', notification);
                }
            }

            console.log(`✅ Task reminders sent: ${tasksDueToday.length} due today, ${overdueTasks.length} overdue`);
        } catch (error) {
            console.error('❌ Error in task reminder scheduler:', error);
        }
    });

    console.log('✅ Task reminder scheduler initialized (runs daily at 9:00 AM)');
}
