# Todo list management system
This project aims to make a simple yet effective way to manage a personal todo list.
## Technologies
- Node.js
- Angular
- TypeScript
- Angular Material
- Angular CDK (Drag and Drop)

## Data
The system stores a todo list where every task has:
- A title
- A short description (optional)
- A priority number (lower is more important, priorities are unique)
- An estimated time to complete in minutes (optional)
- A status of uncompleted, failed, or completed
- An optional rest-time flag

## Functional requirements
- the user must be able to add a task
- the user must be able to remove a task
- the user must be able to edit a task
- the user must be able to reorder tasks via drag and drop, which updates priority
- the user must be able to set the first task start time to minute precision
- the user must be able to sync the start time to the current time

## UI requirements
- the ui must be made using Angular Material components
- the ui must show the 3 states of a task by striking it if it failed, and showing a check icon if it is completed
- the ui must show tasks sorted by priority, with no duplicate priorities
- must have a bar representing 24 hours where every task is shown in order of priority
  - an indicator shows the current time of day
  - an indicator can be used to select when the first task starts (minute precision)
  - a button can sync the start time to now

## non functional requirements
- all the data must be stored in the browser if possible
- should be usable on a mobile phone
- should be able to introduce rest time
