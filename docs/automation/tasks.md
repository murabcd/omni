# Background tasks

Omni can route long requests into background tasks so they can run safely without blocking the chat.

## Behavior

- Long requests are routed to a task and executed asynchronously.
- Each task has a stable ID with status, progress, and a final result.
- Progress is persisted in Durable Objects and checkpointed to R2.

## Commands

Telegram:

```
/task <request>          # start a background task
/task status <id>        # check status
/task cancel <id>        # cancel task
```

Admin chat:

```
task: <request>
background: <request>
now: <request>           # force inline
```

## Environment

```
TASKS_ENABLED=1
TASK_AUTO_URL_THRESHOLD=3
TASK_AUTO_MIN_CHARS=800
TASK_AUTO_KEYWORDS="crawl,scrape,export,csv"
TASK_PROGRESS_MIN_MS=5000
```

## Notes

- Tasks are queued through Sessions DO and run with the same tool policies as
  normal chat messages.
- Progress is rate-limited to avoid spam. Adjust `TASK_PROGRESS_MIN_MS` to tune.
