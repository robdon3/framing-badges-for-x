export function createJobQueue({ concurrency = 1 } = {}) {
  const limit = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const waiting = [];

  function pump() {
    while (active < limit && waiting.length) {
      const job = waiting.shift();
      active += 1;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return {
    enqueue(run) {
      return new Promise((resolve, reject) => {
        waiting.push({ run, resolve, reject });
        pump();
      });
    },
    get active() {
      return active;
    },
    get waiting() {
      return waiting.length;
    },
  };
}
