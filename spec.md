# ToDo list management system
this project aim to make a simple yet effective way to mange a personal todo list
## technologies
- Node.js
- Angular
- Typescript
- Angular material

## Data
the system must be able to store a todo list where every task has a title a short description (optional) a priority number (the lower the more important, tasks can have the same priority) a estimated time to complete (optional), a task could either be in 3 states, uncompleted, failed, completed

## Functional requirements
- the user must be able to add a task
- the user must be able to remove a task
- the user must be able to edit a task

## UI requirements
- the ui must be made using angular materials
- the ui must show the 3 states of a task by stricking it if it failed, check it if it is completed
- must have a button to the right to add task
- must have a bar representing 24 hour where every task is shown in order of priority (if the same then alphabetical)
    - an indicator shows the current time of day
    - an indicator can be used to select when the first task start

## non functional requirements
- all the data must be stored in the browser if possible
- should be usable on a mobile phone
- should be able to introduce rest time