import cron from 'node-cron';
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

    // Run every minute to check for reminders due in ~10 mins
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // Calculate target time: 10 minutes from now
            // We'll broaden the window slightly (e.g., 10-11 mins) to avoid skipping
            const tenMinsLater = new Date(now.getTime() + 10 * 60000);

            const hours = tenMinsLater.getHours();
            const minutes = tenMinsLater.getMinutes();
            // Format HH:MM (24h)
            const targetTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

            // Also need to check if dueDate is TODAY (ignoring time component of Date object if stored)
            // But our Reminder model has `dueDate` (Date) and `dueTime` (String).
            // We assume `dueTime` is the primary trigger for the daily alert.
            // We match reminders where:
            // 1. is_done is false
            // 2. notified is false
            // 3. dueTime matches targetTime
            // 4. dueDate is today (or null/undefined, effectively daily? Assume explicit date required for now)

            // Create start/end of today for date comparison
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);

            const reminders = await Reminder.find({
                is_done: false,
                notified: false,
                dueTime: targetTime,
                dueDate: {
                    $gte: todayStart,
                    $lt: todayEnd
                }
            });

            if (reminders.length > 0) {
                console.log(`🔔 Found ${reminders.length} reminders due in 10 mins at ${targetTime}`);

                for (const r of reminders) {
                    // Create Notification
                    const notif = new Notification({
                        user_id: r.user_id,
                        title: "Reminder Due Soon",
                        message: `In 10 mins: ${r.text}`,
                        type: "reminder",
                        link: "/dashboard"
                    });
                    await notif.save();

                    // Emit Socket
                    if (io) {
                        io.to(r.user_id.toString()).emit('notification', notif);
                    }

                    // Mark as notified
                    r.notified = true;
                    await r.save();
                }
            }
        } catch (err) {
            console.error("Error in minute-reminder-scheduler:", err);
        }
    });

    console.log('✅ Task reminder scheduler initialized (runs daily at 9:00 AM)');
    console.log('✅ Minute reminder scheduler initialized');
}
