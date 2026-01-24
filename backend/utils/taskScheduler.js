import cron from 'node-cron';
import mongoose from 'mongoose';
import Task from '../models/task.js';
import Notification from '../models/notification.js';
import Reminder from '../models/reminder.js';

/**
 * Task Reminder Scheduler
 * Runs daily at 9:00 AM to check for due and overdue tasks
 */
export function initTaskScheduler(io) {
    // Run every day at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
        if (mongoose.connection.readyState !== 1) {
            console.warn('Scheduler: Skipping task reminder because MongoDB is not connected.');
            return;
        }
        console.log('Running task reminder scheduler...');

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

            console.log(`Task reminders sent: ${tasksDueToday.length} due today, ${overdueTasks.length} overdue`);
        } catch (error) {
            console.error('Error in task reminder scheduler:', error);
        }
    });

    // Run every minute to check for reminders
    cron.schedule('* * * * *', async () => {
        if (mongoose.connection.readyState !== 1) {
            return; // Silently skip minute checks if DB is down
        }
        try {
            const now = new Date();
            const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            const fiveMinsLater = new Date(now.getTime() + 5 * 60000);
            const fiveMinHHMM = `${String(fiveMinsLater.getHours()).padStart(2, '0')}:${String(fiveMinsLater.getMinutes()).padStart(2, '0')}`;

            // Create start/end of today for date comparison
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);

            const remindersToNotify = await Reminder.find({
                is_done: false,
                dueDate: { $gte: todayStart, $lt: todayEnd }
            });

            if (remindersToNotify.length > 0) {
                console.log(`[Scheduler] Checking ${remindersToNotify.length} pending reminders for today. Now: ${currentHHMM}, 5m: ${fiveMinHHMM}`);
            }

            // 1. Check for reminders due in 5 minutes
            const fiveMinReminders = remindersToNotify.filter(r =>
                !r.notified5MinBefore && r.dueTime === fiveMinHHMM
            );

            for (const r of fiveMinReminders) {
                console.log(`[Scheduler] Triggering 5-min warning for: ${r.text}`);
                const notif = new Notification({
                    user_id: r.user_id,
                    title: "Reminder in 5 mins",
                    message: `In 5 mins: ${r.text}`,
                    type: "reminder",
                    link: "/dashboard"
                });
                await notif.save();
                if (io) io.to(r.user_id.toString()).emit('notification', notif);
                r.notified5MinBefore = true;
                await r.save();
            }

            // 2. Check for reminders due NOW
            const nowReminders = remindersToNotify.filter(r =>
                !r.notifiedAtTime && r.dueTime === currentHHMM
            );

            for (const r of nowReminders) {
                console.log(`[Scheduler] Triggering exact-time reminder for: ${r.text}`);
                const notif = new Notification({
                    user_id: r.user_id,
                    title: "Reminder Now",
                    message: `Starting now: ${r.text}`,
                    type: "reminder",
                    link: "/dashboard"
                });
                await notif.save();
                if (io) io.to(r.user_id.toString()).emit('notification', notif);
                r.notifiedAtTime = true;
                await r.save();
            }
        } catch (err) {
            console.error("Error in minute-reminder-scheduler:", err);
        }
    });

    console.log('Task reminder scheduler initialized (runs daily at 9:00 AM)');
    console.log('Minute reminder scheduler initialized');
}
