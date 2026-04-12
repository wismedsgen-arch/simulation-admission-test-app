# Functionality Paper: Medical School Admission Email Simulation Website

## 1. Purpose of the System

This website is meant to support a simulated email-based assessment used in the medical school admission process. The goal is to allow psychology staff and evaluators to observe how applicants respond to realistic communication scenarios under time pressure.

The current intended institutional scope for version 1 is:
- **Weizmann Institute of Science**
- single institution deployment
- internal assessment tool, not a multi-tenant product

The core idea is simple:
- the **student** enters a simulated email environment that looks and feels similar to Gmail
- the **psychologist/evaluator** operates behind the scenes and plays the roles of different people in the student’s environment, such as professors, friends, colleagues, administration staff, and others
- the system records the full interaction so that performance can be reviewed both during and after the session

This platform is not a normal email service. It is a **controlled testing environment** designed to simulate communication, decision-making, prioritization, professionalism, and time management.

---

## 2. Main Goals

The website should make the exercise run smoothly, reliably, and with as little manual overhead as possible.

The main goals are:
1. Give each student a clear and realistic email simulation experience.
2. Let psychologists manage multiple students at the same time.
3. Allow psychologists to respond quickly while playing multiple roles.
4. Allow files and attachments to be exchanged naturally.
5. Save all activity for later review.
6. Make the system modular so different tests and scenarios can be created easily.
7. Give admins full visibility and management capabilities.

---

## 3. Main User Types

The system has three main user types.

### 3.1 Student
The student is the person taking the admission exercise.

The student should be able to:
- log in securely
- enter a test session
- read introductory instructions and background information
- access a fake Gmail-like inbox
- open emails
- reply to emails
- compose new emails when allowed by the scenario
- attach files to emails
- receive files from others
- manage their inbox during the exercise
- complete the session within a fixed time window

### 3.2 Psychologist / Evaluator
The psychologist is the active evaluator who runs the exercise in real time.

The psychologist should be able to:
- log in securely
- manage multiple students at the same time
- see incoming student emails for each active student
- understand which fictional role each email belongs to
- reply as the correct role
- attach files in replies
- send prepared scenario emails quickly
- monitor unanswered emails per student
- review active session activity in real time
- later review completed sessions
- claim or select assigned students from a waiting pool before the exercise starts
- start a claimed student's session
- extend or force-end a student's session when needed

### 3.3 Admin
The admin manages the system as a whole.

The admin should be able to:
- create and manage users
- assign roles and permissions
- create and manage tests/scenarios
- manage role definitions inside each test
- manage starting emails and prepared follow-up emails
- monitor live sessions
- review completed sessions
- access system-wide data, logs, and statistics
- control storage, file access, and configuration
- authorize psychologist/admin access
- create additional admins or promote users to admin
- delete sessions, exam cycles, and related data when needed

---

## 4. Overall User Flow

## 4.1 Student Flow
1. Student logs in.
2. Student waits until a psychologist starts the session.
3. Student enters the assigned test.
4. A pop-up or opening screen presents instructions, background reading, and context.
5. Student closes the opening screen.
6. Student sees a Gmail-like inbox with preloaded emails.
7. Student reads emails and begins replying.
8. During the session, additional emails may arrive from the evaluator.
9. Student may send attachments and receive attachments.
10. Session ends automatically after the configured duration, for example 90 minutes, unless the psychologist ends or extends it.
11. The system saves the full session for review.

## 4.2 Psychologist Flow
1. Psychologist logs in.
2. Psychologist enters a waiting/assignment screen before the active session starts.
3. The assignment screen shows the pool of students waiting for the test, including at minimum full name and ID.
4. The psychologist claims students from the waiting pool.
5. Once claimed, those students must disappear from the waiting pool for other psychologists.
6. The psychologist starts the student's session.
7. The psychologist enters the active-session dashboard.
8. Each assigned student appears in a separate tab, panel, or workspace.
9. The psychologist sees incoming student emails in real time.
10. For each email, the psychologist can clearly see which fictional role is expected for the reply.
11. The psychologist can respond manually or send a prepared email template.
12. The psychologist can track unanswered messages per student.
13. The psychologist can extend or force-end sessions when needed.
14. At the end of the session, the psychologist can review saved activity.

## 4.3 Admin Flow
1. Admin logs in.
2. Admin can manage users, scenarios, active sessions, and completed sessions.
3. Admin can create or edit test configurations.
4. Admin can review logs, attachments, and message history.
5. Admin can monitor system health and intervene if needed.

---

## 5. Functional Requirements

## 5.1 Authentication and Account Management

The system must support account creation and login for all main user types.

### Required functionality
- secure login for students, psychologists, and admins with different trust levels
- role-based access control
- no traditional signup flow for version 1
- student login should use full name + ID + one-time access code against a preloaded roster
- staff signup should be request-based and require admin approval
- staff login should use full name + ID + password after approval
- psychologist/admin access must be admin-authorized before the account can be used
- account activation/deactivation or roster enable/disable by admins
- assignment of psychologist to one or more students
- assignment of student to a specific test/scenario

### Notes
- Students should only see their own session.
- Psychologists should only see sessions assigned to them unless broader permission is granted.
- Admins should be able to see everything.
- Student access codes should be visible to admins and psychologists who manage the test.
- Student one-time codes should be created by admins in advance.
- Student one-time codes may be reused for reconnection during the same exam cycle.
- Password-based auth is not currently required for students in version 1.
- Staff authentication should use full name + ID + password after admin approval.

---

## 5.2 Student Opening Screen / Reading Section

When the student first enters the session, the system should display an opening information panel before the inbox becomes active.

### This panel should include
- explanation of the exercise
- general rules
- relevant background story
- descriptions of the fictional environment
- descriptions of key people or roles the student may interact with
- any time limitations or expectations
- optional acknowledgment button such as “I understand” or “Start exercise”

### Important behavior
- this should appear before the student starts working in the inbox
- it should be easy to close once the student is ready
- the system should store that the student opened and closed it, including timestamps if needed
- after the psychologist starts the session, the student should see this popup first
- the live timer should begin only when the student explicitly starts from this screen

---

## 5.3 Student Email Interface

The student interface is one of the most important parts of the system. It should imitate a familiar email experience without trying to recreate every Gmail feature.

### Core goals
- feel natural and easy to understand
- reduce confusion during the test
- support realistic email reading and replying

### Required student email features
- inbox view
- list of received emails
- unread/read indication
- email open/read view
- reply action
- compose new email action
- sent mail view
- draft support and autosave in version 1
- attachment upload
- attachment download/view
- time display for each email
- arrival of new emails in real time or near real time
- recipient selection from a scenario-controlled dropdown directory of fictional contacts
- reply UI that clearly indicates which earlier message is being answered

### Email contents should support
- sender name
- sender role or identity as presented in the scenario
- subject
- message body
- attachments
- timestamp

### Optional but useful features
- search within mailbox
- sorting by newest/oldest
- mailbox folders such as inbox, sent, drafts
- flag/star marking
- warning before leaving unsent draft

### Important design principle
The student interface should look believable and smooth, but it does not need to replicate the full real Gmail product.
It should focus only on the functions needed for the exercise.

### Current direction for message organization
- not a full Gmail-style thread system
- students should still be able to clearly understand which message a reply refers to
- each reply should visibly show that it is replying to an earlier message
- the earlier message should be easy to inspect, for example through a link or popup
- implementation should use lightweight `reply_to_message_id` linkage instead of complex nested threads

---

## 5.4 File Attachment Support

Attachments are essential because the scenario may involve realistic document exchange.

### Required supported actions
- student can attach files to outgoing emails
- student can receive files in incoming emails
- psychologist can attach files to outgoing emails
- psychologist can receive files from students
- attachments must be stored as part of the session history

### File types to support
At minimum, the system should support common office and document file types such as:
- PDF
- Word documents
- PowerPoint files
- Excel files

### Important technical rules
- version 1 default maximum file size should be 25 MB per attachment unless later testing requires a lower limit
- unsupported file types should be blocked clearly
- files should be virus-scanned or otherwise validated if needed
- file names and upload times should be saved
- downloaded files should preserve original names where possible
- browser preview is not required in version 1; file download is enough

---

## 5.5 Real-Time Session Behavior

The system should support live interaction during a running exercise.

### Required real-time functionality
- student receives new emails without needing to refresh the page manually
- psychologist sees incoming student emails quickly
- psychologist replies appear to the student quickly
- prepared emails can be sent during the session at the chosen time
- session timer runs accurately

### Timing requirements
- each session should have a configurable duration, such as 90 minutes
- the system should know when the session starts and ends
- the system should stop the session automatically when time is over, or switch it to read-only mode
- late actions after end time should be prevented or clearly marked

---

## 5.6 Psychologist Dashboard

The psychologist dashboard is the control center for live exercises.

It must be designed for speed, clarity, and low mental load, because one psychologist may manage several students at the same time.

### Main dashboard requirements
- separate workspace for each active student
- student tabs, cards, or columns for switching between students
- visible count of unanswered emails per student
- clear indication when a new message arrives
- ability to open a student workspace instantly
- pre-session assignment view where the psychologist selects students from a waiting pool
- claimed students must be removed from the visible pool for other psychologists immediately
- the claiming action must be atomic so two psychologists cannot take the same student

### For each active student, the psychologist should see
- message list for that student
- incoming messages from the student
- existing scenario messages already exchanged
- role identity associated with each email thread or message
- reply box
- attachment controls
- access to prepared messages for that scenario

### Unanswered message indicator
This is an especially important feature.
The system should show how many student emails still need a response for each active student.
For example:
- Student A: 2 unanswered
- Student B: 0 unanswered
- Student C: 1 unanswered

This helps the psychologist prioritize attention during the live exercise.

---

## 5.7 Role Clarity for Psychologists

Because the psychologist is playing multiple fictional characters, the system must make role identity extremely clear.

### Each message shown to the psychologist should clearly indicate
- which fictional character sent the email to the student originally
- which role the psychologist is expected to answer as
- role name
- optional role category such as professor, friend, administration, colleague
- optional avatar/color coding/tagging for fast recognition

### Example
A psychologist may see:
- “Reply as: Professor Cohen”
- “Role type: Course instructor”
- “Scenario identity: Internal Medicine Department”

This prevents mistakes and reduces confusion when one person is responding as many different characters.

---

## 5.8 Prepared Email Library / Quick Send

The system should allow psychologists to quickly send prewritten emails during the session.

This is a key feature because the evaluator may want to trigger additional test events depending on student behavior.

### Required functionality
- each scenario can include a library of prepared emails
- prepared emails can be linked to specific fictional roles
- psychologist can browse or search prepared emails
- psychologist can send a prepared email to a selected student with very few clicks
- psychologist can optionally edit the prepared email before sending
- psychologist can attach predefined files if the template includes them

### Use cases
- send a scheduling conflict email
- send an urgent request from a professor
- send a personal/social conflict from a friend
- send missing-document request from administration

### Important requirement
Prepared emails should be available per scenario and usable selectively. The psychologist should decide when and to whom to send them.

### Current version 1 decision
- no automatic branching engine is required in version 1
- psychologists manually decide when to send follow-up emails
- the scenario can include emails that are already present before the student enters the inbox

---

## 5.9 Scenario / Test Configuration System

The system must be modular so multiple versions of the exercise can be created and reused.

This is one of the most important long-term requirements.

### A scenario should include
- scenario name
- description
- session duration
- list of fictional roles
- opening reading/instruction content
- initial emails already present in the student inbox
- prepared follow-up emails available to the psychologist
- optional attachments linked to emails
- optional rules such as whether students may compose new emails freely

### Admin functionality for scenarios
- create new scenario
- duplicate existing scenario
- edit scenario
- activate/deactivate scenario
- assign scenario to students or test days

### Current version 1 direction
- scenarios are created and edited by admins only
- a given exam run is expected to use one shared scenario for all students

### Example
**Scenario A**
- 7 starting emails
- roles: professor, friend, department office, research mentor
- 5 prepared follow-up emails

**Scenario B**
- different starting emails
- roles: hospital coordinator, student peer, professor, family member
- different prepared follow-up emails

This allows the testing team to avoid using the exact same scenario every day.

---

## 5.10 Session Management

The system should treat each live exercise as a distinct session.

### Each session should contain
- student identity
- assigned psychologist
- assigned scenario
- start time
- end time
- status such as scheduled, active, completed, interrupted
- full email exchange history
- all attachments sent and received
- timestamps for all actions

### Important session actions
- start session
- force end session
- mark session complete automatically at time limit
- extend session duration if authorized

### Useful additions
- incident reporting field if a technical issue occurs

### Current version 1 direction
- psychologist starts the session
- no admin reassignment in version 1
- psychologists should be able to force-end or extend sessions operationally
- users can disconnect and reconnect during a live session
- reconnect behavior should preserve session continuity rather than reset the session
- student disconnection does not pause the timer
- psychologist disconnection does not pause the student's session

---

## 5.11 Session Replay and Review

After the live exercise ends, the system must preserve the full session for later review.

This is critical for quality control, training of evaluators, and auditability.

### Review mode should allow
- opening a completed session
- seeing the full message timeline
- viewing exactly what was sent and received
- viewing timestamps for each message
- opening all attachments exchanged
- filtering by sender, role, or time
- replaying the sequence in order

### This is useful for
- comparing students
- checking evaluator consistency
- reviewing edge cases or disputes

### Important principle
The saved session should be trustworthy and complete. It should not be possible to silently alter the history after completion.

### Access rule for completed sessions in version 1
- completed sessions can be reviewed by all psychologists and all admins

---

## 5.12 Grading and Evaluation Support

Even if grading is not the first version, the system should leave space for it because it is a natural part of the workflow.

### Useful grading features
- evaluator notes per session
- tags or markers on important emails
- scoring categories such as professionalism, prioritization, empathy, clarity, time management
- final summary for each student
- optional structured grading form

### Recommendation
Grading is not required in version 1.
Version 1 can stop at replay/review of the completed session history.

---

## 5.13 Admin Management Area

Admins need a higher-level control panel.

### Admin capabilities should include
- user management
- role/permission management
- scenario/test management
- active session monitoring
- completed session access
- system statistics
- file storage oversight
- audit log access

### Useful statistics for admins
- number of sessions run
- number of active users
- average response times during sessions
- attachment usage
- psychologist workload by session
- scenario usage frequency

---

## 5.14 Notifications and Visual Indicators

The platform should provide simple but effective notifications.

### Student side
- notification when a new email arrives
- visual unread marker
- optional sound notification if appropriate

### Psychologist side
- notification when a student sends a new email
- prominent unanswered count
- optional color change or badge on the student tab

### Admin side
- alert if a session fails, disconnects, or encounters an error

---

## 5.15 Permissions and Security

Because this system handles sensitive evaluation material, permissions and auditability are very important.

### Required security principles
- role-based access
- secure authentication
- access only to allowed sessions
- protected file storage
- audit logs for important actions
- encrypted communication
- secure session handling and timeout
- admin-only deletion of a whole test and its history

### Deletion authority rule
- only admins may delete data
- the system should support deletion of a full test cycle and all connected records
- session-level and other operational deletions should also remain admin-only

### Example audit events
- login/logout
- file upload/download
- message sent
- scenario edited
- session started/ended
- admin override actions

---

## 5.16 Reliability and Usability Requirements

The platform must be easy to operate under live test conditions.

### Usability goals
- clean interface
- very fast navigation
- minimal unnecessary features
- low learning curve for students
- efficient workflow for psychologists

### Reliability goals
- stable during a 90-minute session
- automatic saving of messages and drafts where appropriate
- no loss of attachments
- graceful handling of network interruptions
- clear error messages

### Recommendation
Autosave and recovery behavior should be included at least for message drafts and active session state.

---

## 6. Recommended Pages / Screens

The following screens are recommended for the first full system.

### Student screens
- login page
- opening instructions modal/screen
- inbox page
- email reading view
- compose/reply view
- session-ended page

### Psychologist screens
- login page
- live dashboard
- student workspace view
- prepared email library panel
- completed-session review page

### Admin screens
- login page
- admin dashboard
- user management
- scenario management
- session monitoring
- session archive/review
- system settings

---

## 7. Suggested Data Structure (Conceptual)

The exact technical implementation can vary, but conceptually the system needs the following main entities.

### Users
- id
- name
- email/username
- role type: student / psychologist / admin
- account status

### Scenarios
- id
- name
- description
- session duration
- opening instructions
- active/inactive

### Scenario Roles
- id
- scenario id
- fictional role name
- role category
- display details

### Emails / Templates
- id
- scenario id
- sender role
- subject
- body
- attachments
- type: starting email / prepared email

### Sessions
- id
- student id
- psychologist id
- scenario id
- start time
- end time
- status

### Messages
- id
- session id
- sender type
- sender role if fictional
- recipient
- subject
- body
- timestamp
- replied/unreplied status if relevant

### Attachments
- id
- message id
- file name
- file type
- storage path
- upload time

### Reviews / Access
- completed session visibility by authorized staff
- immutable replay data
- optional future grading support outside version 1

---

## 8. First Version Scope Recommendation

To avoid making the first version too large, the system can be built in phases.

## Phase 1: Core Live Simulation
This first version should include:
- account login
- student inbox simulation
- opening instructions screen
- psychologist multi-student dashboard
- real-time email exchange
- attachments
- prepared email templates
- session timer and auto-end
- session saving and later review
- admin access
- scenario configuration basics
- draft autosave
- psychologist selection of students from a waiting pool
- psychologist-controlled session start
- operational extend/end controls for psychologists

## Phase 2: Better Evaluation and Control
Later additions can include:
- advanced grading forms
- deeper analytics
- search and filters
- detailed audit reporting
- better template management
- draft autosave improvements
- richer notification system

This phased approach keeps the project realistic while still delivering a system that is fully usable.

---

## 9. Critical Success Factors

For this project to succeed, the following things are especially important:

1. **The student interface must feel simple and believable.**
   If students are confused by the interface, the test quality will suffer.

2. **The psychologist interface must be fast.**
   Since one psychologist may handle several students and roles at once, the dashboard must reduce mental load.

3. **Role clarity must be excellent.**
   The psychologist must always know which fictional person they are speaking as.

4. **Session history must be complete and reliable.**
   Review depends on accurate saved records.

5. **Scenario setup must be modular.**
   The team must be able to create and reuse different test designs without rebuilding the system each time.

---

## 10. Additional Important Features to Consider

The following were not the main focus of the description, but they are highly recommended because they will make the system smoother and more professional.

### 10.1 Draft and autosave support
Students and psychologists may begin writing and get interrupted. Draft preservation can prevent frustration.

### 10.2 Operational flags
In later versions, admins or psychologists may need lightweight issue flags for unusual technical events.

### 10.3 Read-only archive mode
Completed sessions should be accessible in a safe review mode that cannot accidentally change the original history.

### 10.4 File preview support
Previewing PDFs and common documents directly inside the review interface would be useful.

### 10.5 Basic analytics
Simple statistics such as response times, number of emails sent, and number of unread/unanswered items may help later assessment.

### 10.6 Technical support controls
Admins may need to restart a session, extend time, or reassign a psychologist in case of technical problems.

---

## 11. Summary

This website is a controlled email simulation platform for medical school admissions assessment.
It should allow students to work inside a realistic but simplified Gmail-like environment while psychologists guide and evaluate the exercise from behind the scenes.

The system must support:
- secure accounts for students, psychologists, and admins
- an opening instruction screen
- a realistic inbox with reading, replying, composing, and attachments
- a psychologist dashboard for managing multiple students at once
- clear role identity for each reply
- prepared emails that can be sent quickly during the exercise
- configurable scenarios with different roles and starting emails
- full session saving, replay, and review
- admin control and overall visibility

If built well, this system will provide a smooth, repeatable, and scalable way to run complex communication-based admission exercises while preserving all the information needed for later evaluation.

---

## 12. Final Recommendation

The recommended direction is to build this as a **focused, purpose-built testing platform**, not as a full email product.

That means:
- keep the email interface realistic but limited to what the test needs
- invest heavily in the psychologist dashboard and scenario management
- make session recording and review extremely reliable
- keep the first version practical, clean, and stable

This approach gives the testing team a system that is strong enough to run real assessments without making the product unnecessarily complicated.

---

## 13. Scope Freeze Questions and Decision Log

This section exists to turn the paper into an implementation-ready specification.
The product should not be treated as fully defined until the high-risk questions below are answered and copied into the decision log.

### 13.1 How to Use This Section
- Answer the questions in batches.
- After each batch, record the final decision in the decision log.
- If a decision is temporary, mark it as provisional.
- If a question changes architecture, security, data retention, or workflow, update the relevant sections of this paper immediately.

### 13.2 Critical Product Questions

#### A. Session ownership and operations
- How many students should one psychologist be expected to handle at the same time in the real exam?
- Is each student always assigned to exactly one psychologist during a live session, or can admins reassign mid-session?
- Can more than one psychologist watch the same session at the same time?
- Who is allowed to start a session: admin, psychologist, automatic scheduler, or all of them?
- Is pause/resume allowed in real exams, and if yes, who can do it?
- What should happen if the psychologist disconnects during an active session?
- What should happen if the student disconnects during an active session?

#### B. Student mailbox behavior
- Can students send brand-new emails to any address/role, or only reply to existing threads?
- If composing new emails is allowed, how does the student choose recipients: free text, searchable fictional contacts, or a restricted directory?
- Should students see a Gmail-like left sidebar with inbox/sent/drafts, or should the UI stay more minimal?
- Do students need draft autosave in version 1, or can drafts be omitted from the first release?
- Are students allowed to delete messages, archive them, mark them unread, or star them?
- Should emails be threaded like Gmail conversations or shown as independent messages?
- Should students be able to edit a draft after sending? Presumably no, but it should be explicit.

#### C. Psychologist workflow
- When a student sends an email, should the psychologist always answer manually, or can the system suggest the likely role automatically?
- Can a psychologist send an email from any fictional role at any time, or only roles that belong to that scenario?
- Should prepared emails be sent exactly as written, or can psychologists edit them before sending by default?
- Do psychologists need internal notes during the live session that the student cannot see?
- Should psychologists be able to see a timer per student, SLA-style unanswered counts, and last activity timestamp?
- Do psychologists need keyboard shortcuts and fast actions in version 1?

#### D. Scenario authoring
- Who authors scenarios in practice: admins only, psychologists, or a dedicated content team?
- Does every scenario reuse a shared role library, or does each scenario define its own fictional roles independently?
- Do prepared emails depend only on the scenario, or also on student actions and branching rules?
- Do you want branching logic in version 1, or should the evaluator manually decide when to send follow-ups?
- Can a scenario include hidden scoring guidance for evaluators?
- Does a scenario belong to a single exam date, or can it be reused across many cohorts?

#### E. Review and grading
- Is grading part of version 1 or only basic notes plus replay?
- If grading is in version 1, what are the exact scoring categories and scale?
- Can more than one evaluator grade the same session?
- Should the review screen preserve an immutable event timeline and a separate evaluator-notes layer?
- Do admins need exports such as PDF, CSV, or raw audit history?

#### F. Attachments and content safety
- What is the maximum attachment size allowed?
- Which exact file types are permitted in version 1?
- Should students be allowed to upload images captured from a device, or only standard files?
- Is attachment preview required in the browser for PDFs and images, or is download enough for version 1?
- Do attachments need malware scanning before being downloadable?
- How long must attachments be retained after an exam cycle?

#### G. Identity, security, and compliance
- Will users authenticate with email/password, magic link, SSO, or admin-created credentials?
- Should student accounts be pre-created for a single exam day and then disabled afterward?
- Are there compliance requirements beyond general security, such as institutional privacy rules or local data retention rules?
- How long should session history, messages, attachments, and audit logs be retained?
- Who may view completed sessions: assigned psychologist only, all psychologists, admins, or a configurable rule?
- Do you need a fully immutable audit trail for legal defensibility?

#### H. Deployment and environment
- Will the first release be internal-only for one institution, or multi-tenant across multiple schools?
- What is the expected peak concurrency for the first live deployment: active students, psychologists, and admins?
- Do you want a single production environment first, or separate staging and production from day one?
- Do you need custom email-domain branding inside the fake UI, or is fictional branding enough?
- Should the system send any real external emails, or is all mail strictly inside the simulation?

### 13.3 Initial Decision Log

Use this table as answers are finalized.

| Area | Decision | Status | Date | Notes |
|---|---|---|---|---|
| Session ownership | Each student is assigned to one psychologist for the session; no reassignment in V1 | Decided | 2026-03-30 | Psychologists claim students from a shared waiting pool |
| Student compose rules | Students can reply and compose new emails | Decided | 2026-03-30 | Recipients chosen from dropdown of scenario contacts |
| Threading model | Lightweight reply linkage, not full Gmail threading | Decided | 2026-03-30 | Replies should clearly show the referenced earlier message |
| Psychologist concurrency target | Configurable; usually 1-10 students per psychologist | Decided | 2026-03-30 | UI must support assignment and monitoring at this scale |
| Scenario branching in V1 | Manual follow-up choice by psychologist | Decided | 2026-03-30 | No automatic branching engine in V1 |
| Grading in V1 | Excluded from version 1 | Decided | 2026-03-30 | No grading notes required |
| Attachment policy | Office-style documents only, 25 MB max per file | Decided | 2026-03-30 | PDF, Word, PowerPoint, Excel |
| Authentication method | Students use full name + ID + one-time code; staff use full name + ID + password after admin approval | Decided | 2026-03-30 | Different auth flows for students and staff |
| Staff signup flow | Staff requests signup and admin approves | Decided | 2026-03-30 | Applies to psychologists and admins |
| Student code generation | Admin creates codes in advance | Decided | 2026-03-30 | |
| Student code reuse | Code may be reused for reconnection in the same exam cycle | Decided | 2026-03-30 | |
| Data retention policy | Keep data long term until the whole test cycle is deleted | Decided | 2026-03-30 | Deletes remain admin-only |
| Deployment topology | Single institution deployment for Weizmann Institute of Science | Decided | 2026-03-30 | Railway should use staging and production |
| Railway service topology | One web service plus PostgreSQL and object storage in V1 | Decided | 2026-03-30 | No separate worker unless later needed for background jobs |
| Session start rule | Psychologist initiates start, student then sees intro popup | Decided | 2026-03-30 | Student may log in before start |
| Timer start rule | Timer starts when the student explicitly starts from the intro screen | Decided | 2026-03-30 | |
| Waiting pool behavior | Any psychologist may claim any waiting student | Decided | 2026-03-30 | Claimed student disappears for others immediately |
| Scenario ownership | Admins only | Decided | 2026-03-30 | Admins create and edit scenarios |
| Scenario assignment pattern | Same scenario for all students in an exam run | Decided | 2026-03-30 | |
| Recipient count | One recipient per outgoing student email | Decided | 2026-03-30 | No CC in version 1 |
| Reply subject behavior | Reply keeps the original subject | Decided | 2026-03-30 | |
| Preloaded email source | Preloaded emails are defined in the scenario ahead of time | Decided | 2026-03-30 | |
| Completed session access | All psychologists and all admins can review completed sessions | Decided | 2026-03-30 | |
| Disconnect timer rule | Session timer keeps running during disconnects | Decided | 2026-03-30 | |
| Psychologist disconnect rule | Student session keeps running if psychologist disconnects | Decided | 2026-03-30 | |
| Delete authority | Only admins may delete session data or a whole test cycle and its history | Decided | 2026-03-30 | |

### 13.4 Scope Freeze Gate

The product scope is now sufficiently defined to begin implementation.

The remaining details below should be handled during technical design, not as blockers:
- exact admin workflow for roster upload and exam-cycle setup
- exact UI treatment of cross-psychologist visibility for active sessions
- exact deletion flow screens and confirmations
- exact field list for imported roster records

---

## 14. Implementation Instructions

This section defines the recommended implementation path based on the current paper.
It should now be treated as the working implementation direction for version 1.

### 14.1 Recommended Version 1 Product Boundary

Version 1 should include:
- secure login for students, psychologists, and admins
- scenario-based session launch
- student inbox with read, reply, and optional compose
- psychologist live dashboard for multiple students
- prepared email sending
- attachment upload and download
- real-time message delivery
- timer-based session lifecycle
- immutable session history for review
- admin scenario and user management
- psychologist-side waiting pool selection and student claiming/assignment
- atomic claiming so only one psychologist can take a student
- admin-controlled student code creation ahead of the exam

Version 1 should not include unless explicitly approved:
- AI-generated responses
- automatic scenario branching engine
- external email sending
- a full Gmail clone
- advanced analytics beyond core operational metrics
- grading workflows unless the team adds them back explicitly

### 14.2 Recommended Technical Architecture

Use a standard web application architecture with four core parts:

1. Web application
- serves the student, psychologist, and admin interfaces
- handles authentication and role-based access control
- exposes APIs for scenario management, session control, messages, and review

2. Relational database
- stores users, staff signup requests, exam cycles, scenarios, sessions, messages, audit events, and attachment metadata
- PostgreSQL is the recommended default on Railway

3. Object storage
- stores attachments and optionally exported review artifacts
- use a Railway bucket or another S3-compatible bucket

4. Real-time transport
- delivers new-message events, timer updates, unanswered counts, and presence changes
- WebSockets or server-sent events are acceptable
- should also propagate waiting-pool claim updates immediately

### 14.2.1 Clean Code and Project Structure

The implementation should optimize for long-term maintainability, not just speed of first delivery.

Recommended structural rules:
- keep one deployable Railway web service in version 1, but separate the code internally into clear modules
- separate UI, application logic, data access, and infrastructure concerns
- keep domain rules out of UI components
- keep Railway- or storage-specific code behind small service adapters
- prefer explicit service boundaries such as `auth`, `sessions`, `scenarios`, `messages`, `attachments`, and `admin`
- use shared validation schemas at API boundaries
- keep database writes transactional for session start, student claim, message send, and session end
- avoid over-engineering with microservices in version 1

Recommended internal layers:
1. `app` or route layer
- HTTP endpoints, server actions, page entry points, auth guards

2. `domain` or service layer
- session rules, claiming logic, timer rules, role permissions, message send rules

3. `data` layer
- database queries, transactions, repository helpers

4. `infra` layer
- Railway bucket integration, realtime transport, hashing, logging, background-safe utilities

Important principle:
- any rule that affects correctness or security should live on the server side and be testable without the UI

### 14.3 Recommended Domain Model

The implementation should formalize these entities:
- `users`
- `roles`
- `students`
- `psychologists`
- `admins`
- `staff_signup_requests`
- `scenarios`
- `scenario_roles`
- `scenario_messages`
- `scenario_attachments`
- `exam_cycles`
- `exam_cycle_students`
- `sessions`
- `session_participants`
- `session_messages`
- `session_attachments`
- `session_events`
- `audit_logs`

Important rule:
- `session_messages` must be append-only after send
- edits, deletions, overrides, forced endings, and reassignment actions must be represented as separate events in `session_events`
- student claims should also be represented as auditable events

### 14.4 Recommended Non-Functional Rules

- Every sent message must be persisted before the UI reports success.
- Real-time delivery should update the UI quickly, but the database is the source of truth.
- Session end must be enforced on the server, not only in the browser.
- All attachment access must be authorization-checked.
- Completed session history should be read-only in the product UI.
- All privileged actions should emit audit events.
- waiting-pool claim operations must be transaction-safe and race-safe

### 14.4.1 Cost-Control Principles

The version 1 implementation should be intentionally cost-conscious on Railway.

Recommended cost rules:
- start with one Railway web service only
- avoid adding Redis, a worker, or extra services unless a measured need appears
- use PostgreSQL as the main source of truth instead of introducing more infrastructure
- store attachments in a bucket, not in the database
- keep attachment preview out of version 1
- keep polling low; prefer websocket or efficient near-real-time updates
- keep logs useful but not excessively verbose
- cleanly separate staging from production, but keep both minimal
- prefer simple background behavior that can run inline during v1 if it does not harm response time
- do not add expensive third-party services unless they solve a real operational problem

### 14.5 Railway Deployment Topology

Recommended initial Railway setup:

1. Main web service
- hosts the full app and API
- should be the only internet-facing app service in version 1 unless background work requires separation

2. PostgreSQL service
- stores all relational data

3. Object storage bucket
- stores attachments

4. Optional worker service
- not required for version 1 by default
- add only if background jobs are later required for malware scanning, exports, scheduled reminders, or cleanup

Recommended environments:
- `staging`
- `production`

If the first release is internal and time-constrained, it is acceptable to start with `production` only, but the paper should explicitly say so.

Current deployment scope:
- one institution only
- Weizmann Institute of Science
- internal simulation system
- Railway environments should include both `staging` and `production`

### 14.6 Railway Configuration Checklist

Before go-live, define:
- Railway project name
- environments to create
- service names
- domain strategy
- database backup policy
- object storage bucket name
- secrets ownership and rotation process
- deployment source: GitHub deploy or CLI deploy

Expected environment variables:
- `DATABASE_URL`
- `SESSION_SECRET` or equivalent auth secret
- `APP_BASE_URL`
- `NODE_ENV` or framework equivalent
- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_BUCKET`
- `WEBSOCKET_ORIGIN` or equivalent if needed

Optional variables depending on implementation:
- `REDIS_URL`
- `MALWARE_SCAN_ENABLED`
- `MAX_ATTACHMENT_BYTES`
- `SESSION_DEFAULT_DURATION_MINUTES`
- `STUDENT_CODE_TTL_MINUTES`

Recommendation for version 1:
- do not use `REDIS_URL` unless realtime or rate-limiting design proves it is necessary
- keep optional services off by default

### 14.7 Implementation Sequence

Build in this order:

1. Foundation
- choose framework, auth method, ORM, and schema
- create users, signup requests, exam cycles, scenarios, sessions, messages, attachments, and audit models
- deploy a basic Railway app plus PostgreSQL
- wire object storage early so attachment handling is implemented correctly from the start

2. Admin tools
- create user, signup-approval, exam-cycle, and scenario management
- support scenario roles, starting emails, and prepared templates

3. Student experience
- implement login, opening instructions, inbox, reading, reply, optional compose, and session timer

4. Psychologist live dashboard
- implement multi-student workspace, role clarity, prepared send, unanswered count, and operational controls

5. Review mode
- implement immutable session replay, attachments, and timestamps

6. Hardening
- add audit coverage, reconnection handling, attachment policy enforcement, and operational monitoring
- verify Railway deployment behavior, storage permissions, and production-safe environment configuration

### 14.8 Testing Requirements

The first release should include:
- unit tests for authorization and session lifecycle rules
- integration tests for send/reply flows
- attachment validation tests
- end-of-session lockout tests
- reconnection tests for active sessions
- role-visibility tests so psychologists never answer as the wrong fictional identity

Manual acceptance tests should cover:
- one psychologist handling multiple students
- mid-session new message arrival
- prepared email send with attachment
- attachment upload/download
- forced session end
- completed session review

### 14.9 Operational Runbook Requirements

Before live usage, create an operator runbook that covers:
- how to start exam sessions
- how to verify students are assigned correctly
- what to do if a student disconnects
- what to do if a psychologist disconnects
- how to reassign a session
- how to extend time
- how to force end a session
- how to access the audit trail after an incident

---

## 15. Suggested Build Constraints

To keep the project implementable, the following constraints are recommended unless changed by explicit decision:
- internal simulation only, not real-world email delivery
- one institution in version 1
- append-only message history
- no message deletion after send
- scenario-driven fictional contacts only
- no branching engine in version 1 unless the team requests it specifically
- limited attachment types and file sizes
- one web app service on Railway before splitting services
- no browser attachment preview in version 1
- no extra infrastructure unless clearly needed by load or correctness

---

## 16. Next Working Method

The correct workflow for this project is:
1. turn this paper into a technical specification
2. design the schema and user flows
3. implement locally with clean module boundaries
4. connect Railway PostgreSQL and bucket storage
5. deploy to Railway staging
6. run end-to-end simulation tests
7. promote to production
