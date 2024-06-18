# Sync_My_Calendar

This is a Google App Script that helps sync your personal calendar to your work calendar automatically. All the events in your personal calendar will be synced as "Personal Busy Block" in your work calendar.



## Install and Use

1. Go to your personal calendar and Click on Settings
2. Choose the calendar you want to share and Click on "Integrate Calendar"
3. Copy the Calendar ID as your personal calendar id
4. Click on "Share with specific people or groups", click the button "Add people and groups", Add the your work email. Choose "Make changes and manage sharing"
5. Go to your work email, you will see an email informing you someone has shared a calendar with you. Click on the link on "Add this calendar" and accept the invitation.
6. Go to your work calendar and Click on Settings. Choose the calendar you want to sync with and Click on "Integrate Calendar", save the Calendar ID as your work calendar id.
7. Open a new tab in your browser, type "script.new" and press enter. This step will help you create a new Google Apps Script.
8. Copy the whole content in sync_my_calendar.js to your new script.
9. Go to the first few lines of your script, update it will your personal and work calendar id.
10. Click on the "+" sign on the left sidebar of "Services" and choose "Google Calendar API" (the default version is v3), and press the "Add" button.
11. Save your script
12. Click on the trigger button (An Alarm like button) on the left sidebar and press "Add Trigger"
13. Choose which function to run: choose "myFunction"
14. Under "Select event source": choose "From calendar"
15. In the blank of "Calendar owner email", paste your personal email id, and press "Save"
16. You are now good to go!
