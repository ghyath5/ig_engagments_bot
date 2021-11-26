// import kue from 'kue-scheduler'
// var Queue = kue.createQueue();

// //create a job instance
// var job = Queue
//             .createJob('every')
//             .attempts(3)
//             .priority('normal');

// //schedule it to run every 2 seconds
// Queue.every('*/10 * * * * *', job);


// //somewhere process your scheduled jobs
// Queue.process('every', function(job, done) {
//     done();
// });