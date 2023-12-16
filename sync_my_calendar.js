function myFunction() {
    const src_calendar_id = "Your_Personal_Calendar_ID";
    const res_calendar_id = "Your_Work_Calendar_ID";
    const busyBlockTitle = "Personal Busy Block";
    syncEvents(src_calendar_id, res_calendar_id, busyBlockTitle, false);
}

function syncEvents(src_calendarID, res_calendarID, busyBlockTitle, isFullSync) {
    let properties = PropertiesService.getUserProperties();
    let options = {};
    let syncToken;
    try { // try to get syncToken stored in PropertiesService
        syncToken = properties.getProperty('syncToken');
        console.log('get synctoken: %s', syncToken);
    } catch (err) {
        console.log('Fail to get syncToken property');
        isFullSync = true;
    }

    if (!isFullSync && syncToken) { // if isFullSync === false and syncToken exists 
        options.syncToken = syncToken; // add syncToken to options
    }

    // Retrieve events one page at a time
    let events;
    let pageToken;
    do {
        try {
            options.pageToken = pageToken;
            events = Calendar.Events.list(src_calendarID, options);
        } catch (e) {
            // check if the sync token was invalidated by the server;
            // if so, perform a full sync instead.
            if (e.message === 'Sync token is no longer valid, a full sync is required.') {
                properties.deleteProperty('syncToken');
                syncEvents(src_calendarID, res_calendarID, busyBlockTitle, true);
                return;
            }
            throw new Error(e.message);
        }

        // if there is no changes in the calendar
        if (events.items && events.items.length === 0) {
            console.log('No event changes found.');
            return;
        }

        console.log('The number of changes: %d', events.items.length);

        for (const event of events.items) { // for each changes in the source calendar
            // search for recurring events id in res calendar
            const res_recur_event_id = search_recur_event_id(res_calendarID, event.id, event.recurringEventId); // search in res calendar

            if (event.status === 'cancelled') {
                // if event is cancelled: 1) cancel single event or recurring all event; 2) cancel a recurring event exception
                console.log('Event ID %s was cancelled', event.id);
                console.log('event recurrence and recurEventId: %s, %s', event.recurrence, event.recurringEventId);
                // check if cancelled event is recurring event
                // if yes, print id, recurringEventId, originalStartTime
                // if it is a recurring event
                if ((!event.recurrence) ^ (!event.recurringEventId)) {
                    //=====================
                    console.log('Trying to cancel a recurring event exception in res calendar.=====')
                    //=====================
                    console.log('In cancel_recur_event function')
                    cancel_recur_event(res_calendarID, res_recur_event_id, event);
                    continue;
                }

                // if it is a cancelled single event or cancelled all recurring event
                console.log('Trying to cancel a single event or cancel recurring all in res calendar ====')
                //=====================
                const existed_Events = search_res_event(res_calendarID, event.id);
                if (existed_Events === null) {
                    console.log('Error: the target event to be deleted does not exist in res calendar');
                } else if (existed_Events.items.length > 1) {
                    console.log('Error: res calendar has multiple busy blocks link to same event_id');
                } else { // existed_Events.items.length === 1
                    const event_to_delete = existed_Events.items[0];
                    Calendar.Events.remove(res_calendarID, event_to_delete.id);
                    console.log('Successfully remove a single event/recurring all in res calendar');
                }
                continue;

            }
            else { // if event is created/changed
                console.log('Trying to create/change a event=====')
                //=====================

                // if it is a recurring event
                if ((!event.recurrence) ^ (!event.recurringEventId)) {
                    if (!res_recur_event_id) { // no existed event in res calendar
                        console.log('Trying to create a new recurring event ====')
                        create_one_recur_event(res_calendarID, busyBlockTitle, event);
                    } else { // else: change/update a recurring event
                        console.log('Trying to change a recurring event======')
                        change_recur_event(res_calendarID, res_recur_event_id, busyBlockTitle, event);
                    }
                    continue;
                }


                //=====================
                // deal with single event
                console.log('single event: %s, %s', event.recurrence, event.recurringEventId);
                console.log('Trying to create/change a single event=====')

                // if it is an all-day event
                if (event.start.date) {
                    // check if event existed in res calendar
                    const existed_Events = search_res_event(res_calendarID, event.id);
                    if (existed_Events === null) { // if event does not exist in res calendar
                        // create all-day block in res calendar
                        create_allday_event(res_calendarID, busyBlockTitle, event);
                        console.log('Create new all-day event %s', event.start.date);
                    } else if (existed_Events.items.length > 1) {
                        console.log('Error: res calendar has multiple all-day busy blocks link to same event_id');
                    } else { // existed_Events.items.length === 1
                        // update the existed event
                        const event_to_change = existed_Events.items[0]; // get the event in res calendar
                        Calendar.Events.patch(
                            {
                                start: {
                                    date: event.start.date,
                                    timeZone: event.start.timeZone
                                },
                                end: {
                                    date: event.end.date,
                                    timeZone: event.end.timeZone
                                },
                            },
                            res_calendarID, event_to_change.id
                        );
                        console.log(`Change an all-day event, ID: %s`, event_to_change.id);
                    }
                    continue;
                }

                // For timed events
                // check if event existed in res calendar
                const existed_Events = search_res_event(res_calendarID, event.id);
                if (existed_Events === null) { // create new block in res calendar
                    // create timed block in res calendar
                    create_timed_event(res_calendarID, busyBlockTitle, event);
                    console.log('Create new timed event %s', event.start.dateTime);
                } else if (existed_Events.items.length > 1) {
                    console.log('Error: Existed multiple timed busy blocks link to same event_id in src calendar');
                } else { // existed_Events.items.length === 1
                    // change the start and end of the existed event
                    const event_to_change = existed_Events.items[0];
                    Calendar.Events.patch(
                        {
                            start: {
                                dateTime: event.start.dateTime,
                                timeZone: event.start.timeZone
                            },
                            end: {
                                dateTime: event.end.dateTime,
                                timeZone: event.end.timeZone
                            },
                        },
                        res_calendarID, event_to_change.id
                    );
                    console.log(`Change a timed event, ID: %s`, event_to_change.id);

                }
            }
        }

        pageToken = events.nextPageToken;

    } while (pageToken); // continue if there is next page

    console.log('updated syncToken: %s', events.nextSyncToken);
    properties.setProperty('syncToken', events.nextSyncToken);

}

/**
* Function to find an event in res calendar and return the 
* event list found
* 
* Precondition:
*  res_calendar_ID: result calendar ID
*  src_event_ID: the source event ID
* 
* Postcondition:
*  return event lists
*  if no events found: null
* 
*/
function search_res_event(res_calendar_ID, src_event_ID) {
    const res_events = Calendar.Events.list(res_calendar_ID,
        {
            sharedExtendedProperty: 'src_event_id=' + src_event_ID
        }
    );

    if (!res_events || res_events.items.length === 0) {
        console.log('No existed busy blocks found in res calendar.');
        return null;
    }

    console.log('Number of event found with extended property: %d', res_events.items.length);
    for (const event of res_events.items) {
        console.log('res event shared extended property: %s', event.extendedProperties);
    }
    return res_events;
}



function create_timed_event(res_calendar_ID, busyBlockTitle, src_event) {
    // event details for creating event.
    let event = {
        summary: busyBlockTitle,
        start: {
            dateTime: src_event.start.dateTime,
            timeZone: src_event.start.timeZone
        },
        end: {
            dateTime: src_event.end.dateTime,
            timeZone: src_event.end.timeZone
        },
        extendedProperties: {
            shared: {
                src_event_id: src_event.id
            }
        },
    };

    try {
        event = Calendar.Events.insert(event, res_calendar_ID);
        console.log('Create res event, ID: %s', event.id);
    } catch (err) {
        console.log('Failed with error: %s', err.message);
    }

}

function create_allday_event(res_calendar_ID, busyBlockTitle, src_event) {
    // event details for creating event.
    let new_event = {
        summary: busyBlockTitle,
        start: {
            date: src_event.start.date
        },
        end: {
            date: src_event.end.date
        },
        extendedProperties: {
            shared: {
                src_event_id: src_event.id
            }
        },
    };

    try {
        new_event = Calendar.Events.insert(new_event, res_calendar_ID);
        console.log('Create res event, ID: %s', new_event.id);
    } catch (err) {
        console.log('Failed with error: %s', err.message);
    }

}

function create_one_recur_event(res_calendar_id, busyBlockTitle, src_event) {
    // if it is an all-day recurring event
    if (src_event.start.date) {
        Calendar.Events.insert({
            summary: busyBlockTitle,
            start: {
                date: src_event.start.date,
                timeZone: src_event.start.timeZone
            },
            end: {
                date: src_event.end.date,
                timeZone: src_event.end.timeZone
            },
            recurrence: src_event.recurrence,
            extendedProperties: {
                shared: {
                    src_event_id: src_event.id
                }
            },
        }, res_calendar_id
        );
        console.log('Create an all-day recurring event');

    } else { // if it is a timed recurring event
        Calendar.Events.insert({
            summary: busyBlockTitle,
            start: {
                dateTime: src_event.start.dateTime,
                timeZone: src_event.start.timeZone
            },
            end: {
                dateTime: src_event.end.dateTime,
                timeZone: src_event.end.timeZone
            },
            recurrence: src_event.recurrence,
            extendedProperties: {
                shared: {
                    src_event_id: src_event.id
                }
            },
        }, res_calendar_id
        );
        console.log('Create a timed recurring event');
    }

}

function change_recur_event(res_calendar_id, res_recur_event_id, busyBlockTitle, src_event) {
    // try to access orignalStart time; if error ==> change this and following
    let instance;
    try {
        const original = src_event.originalStartTime;
        console.log('src_event id :%s', src_event.id);
        if (src_event.start.date) { // if it is an all-day recurring event
            instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
                {
                    originalStart: src_event.originalStartTime.date.toString()
                }
            );
        } else {
            instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
                {
                    originalStart: src_event.originalStartTime.dateTime.toString()
                }
            );
        }
        if (instance.items.length === 0) {
            console.log('Error: could not find corresponding event in res calendar');
            return; // break out of the function
        } else if (instance.items.length > 1) {
            console.log('Error: more than one corresponding events in res calendar');
            return; // break out of the function
        } else { // instance.items.length === 0
            instance = instance.items[0]
        }

        const rec_rule = src_event.recurrence ? src_event.recurrence : "";
        console.log('recurrence rule: %s', rec_rule);

        if (src_event.start.date) { // if it is an all-day recurring event
            Calendar.Events.update(
                {
                    summary: busyBlockTitle,
                    start: {
                        date: src_event.start.date,
                        timeZone: src_event.start.timeZone
                    },
                    end: {
                        date: src_event.end.date,
                        timeZone: src_event.end.timeZone
                    },
                    recurrence: rec_rule,
                }, res_calendar_id, instance.id
            );
            console.log('Successfully patch an all-day recurring event');
        } else { // it is a timed recurring event
            Calendar.Events.update(
                {
                    summary: busyBlockTitle,
                    start: {
                        dateTime: src_event.start.dateTime,
                        timeZone: src_event.start.timeZone
                    },
                    end: {
                        dateTime: src_event.end.dateTime,
                        timeZone: src_event.end.timeZone
                    },
                    recurrence: rec_rule,
                }, res_calendar_id, instance.id
            );
            console.log('Successfully patch a timed recurring event');
        }

    } catch (err) { // changes have been made to recurring event by 'this and following'
        console.log('original time not defined error======');

        instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
            {
                maxResults: 1
            }
        );

        instance = instance.items[0];
        // update the mother event
        if (src_event.start.date) { // if it is an all-day event
            Calendar.Events.update(
                {
                    summary: busyBlockTitle,
                    start: {
                        date: src_event.start.date,
                        timeZone: src_event.start.timeZone
                    },
                    end: {
                        date: src_event.end.date,
                        timeZone: src_event.end.timeZone
                    },
                    recurrence: src_event.recurrence,
                    extendedProperties: {
                        shared: {
                            src_event_id: src_event.id
                        }
                    },
                },
                res_calendar_id, res_recur_event_id
            );
            console.log('update an all-day recurring event');
        } else {
            Calendar.Events.update(
                {
                    summary: busyBlockTitle,
                    start: {
                        dateTime: src_event.start.dateTime,
                        timeZone: src_event.start.timeZone
                    },
                    end: {
                        dateTime: src_event.end.dateTime,
                        timeZone: src_event.end.timeZone
                    },
                    recurrence: src_event.recurrence,
                    extendedProperties: {
                        shared: {
                            src_event_id: src_event.id
                        }
                    },
                },
                res_calendar_id, res_recur_event_id
            );
            console.log('update a timed recurring event');
        }

    }
}

/**
* Function: search recurring event id in the res calendar
* Precondition: res calendar id, source event id, source event recurring event id
* Postcondition: return the recurring event id in the res calendar
*/
function search_recur_event_id(res_calendarID, src_event_id, src_event_recurring_id) {
    // determine the real source recurring Event id
    let recurringEventId;
    if (src_event_id && src_event_recurring_id) {
        recurringEventId = src_event_recurring_id;
    } else {
        recurringEventId = src_event_id;
    }

    // search source recurring Event id in res calendar at shared extended properites
    console.log('Search for shared properties in res calendar========');
    const events = Calendar.Events.list(res_calendarID,
        {
            sharedExtendedProperty: 'src_event_id=' + recurringEventId,
            maxResults: 1
        }
    );

    if (!events || events.items.length === 0) {
        console.log('No recurring events found in res calendar');
        return null;
    }

    for (const event of events.items) {
        console.log('event shared extended property in res calendar: %s', event.extendedProperties);
        console.log('recurring event id in res calendar: %s', event.recurringEventId);
        console.log('recurrence rule in res calendar: %s', event.recurrence);
        console.log('event id in res calendar: %s', event.id);
    }

    return events.items[0].id;
}


function cancel_recur_event(res_calendar_id, res_recur_event_id, src_event) {

    let instance;
    console.log('src event original start %s', src_event.originalStartTime.dateTime)
    console.log('src_event id :%s', src_event.id);
    if (src_event.originalStartTime.date) { // if it is an all-day recurring event
        console.log('it is an all-day event')
        instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
            {
                originalStart: src_event.originalStartTime.date
            }
        );
    } else {
        console.log('this is a timed event')
        instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
            {
                originalStart: src_event.originalStartTime.dateTime
            }
        );
        console.log('instance length: %d', instance.items.length)
    }

    if (instance.items.length === 0) {
        console.log('Error: could not find corresponding event in res calendar');
        return; // break out of the function
    } else if (instance.items.length > 1) {
        console.log('Error: more than one corresponding events in res calendar');
        return; // break out of the function
    } else { // instance.items.length === 0
        instance = instance.items[0]
    }

    //cancel one event ===================
    if (instance.start.date) {
        Calendar.Events.update(
            {
                summary: src_event.summary,
                status: 'cancelled',
                start: {
                    date: instance.start.date,
                    timeZone: instance.start.timeZone
                },
                end: {
                    date: instance.end.date,
                    timeZone: instance.end.timeZone,
                },
                recurrence: instance.recurrence,
                extendedProperties: {
                    shared: {
                        src_event_id: src_event.id
                    }
                },
            },
            res_calendar_id, instance.id
        );
    } else {
        Calendar.Events.update(
            {
                summary: src_event.summary,
                status: 'cancelled',
                start: {
                    dateTime: instance.start.dateTime,
                    timeZone: instance.start.timeZone
                },
                end: {
                    dateTime: instance.end.dateTime,
                    timeZone: instance.end.timeZone,
                },
                recurrence: instance.recurrence,
                extendedProperties: {
                    shared: {
                        src_event_id: src_event.id
                    }
                },
            },
            res_calendar_id, instance.id
        );
    }
    console.log('Successfully cancelled one recurring event exception, id: %s', instance.id);

}
