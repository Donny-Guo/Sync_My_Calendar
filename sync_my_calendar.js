const src_calendar_id = "Your_Personal_Calendar_ID"; // for example your personal calendar id
const res_calendar_id = "Your_Work_Calendar_ID"; // for example your work calendar id
const busy_block_Title = "Personal Busy Block";
const is_verbose = false;
const is_full_sync = false;

// Script starts here
function myFunction() {
    syncEvents(src_calendar_id, res_calendar_id, busy_block_Title, is_full_sync);
}

// wrapper function for console.log to control print out debug message or not
function log(...args) {
    if (is_verbose) {
        console.log(...args);
    }
}

// wrapper function to sync events from src calendar to res calendar
function syncEvents(src_calendarID, res_calendarID, busy_block_Title, is_full_sync) {
    let properties = PropertiesService.getUserProperties();
    let options = {};
    let syncToken = null;
    try { // try to get syncToken stored in PropertiesService
        syncToken = properties.getProperty('syncToken');
        log('get synctoken: %s', syncToken);
    } catch (err) {
        log('Fail to get syncToken');
        is_full_sync = true;
    }

    if (!is_full_sync && syncToken) { // if is_full_sync === false and syncToken exists 
        options.syncToken = syncToken; // add syncToken to options
    }

    let events;
    let pageToken = null;
    
    // Retrieve events one page at a time
    do {
        try { // try to retrieve events
            options.pageToken = pageToken;
            events = Calendar.Events.list(src_calendarID, options);
        } catch (e) {
            // check if the sync token was invalidated by the server;
            // if so, perform a full sync instead.
            if (e.message === 'Sync token is no longer valid, a full sync is required.') {
                properties.deleteProperty('syncToken');
                syncEvents(src_calendarID, res_calendarID, busy_block_Title, true);
                return;
            }
            throw new Error(e.message);
        }

        // if there is no changes in the calendar
        if (events.items && events.items.length === 0) {
            log('No event changes found.');
            return;
        }

        log('The number of changes: %d', events.items.length);

        for (const event of events.items) { // for each changes in the source calendar
            // search for recurring events id in res calendar
            const res_recur_event_id = search_recur_event_id(res_calendarID, event.id, event.recurringEventId);

            if (event.status === 'cancelled') { // if event is cancelled

                log('Event ID %s was cancelled', event.id);
                log('event recurrence and recurEventId: %s, %s', event.recurrence, event.recurringEventId);
                // if event is cancelled: 1) cancel a recurring event exception; 2) cancel single event or recurring all event;
                // 1) check if cancelled event is recurring event
                if ((!event.recurrence) ^ (!event.recurringEventId)) {
                    cancel_recur_event(res_calendarID, res_recur_event_id, event);
                    continue;
                }
                // 2) cancel single event or recurring all event
                const existed_Events = search_res_event(res_calendarID, event.id); // find this event in res calendar
                if (existed_Events === null) {
                    log('Error: the target event to be deleted does not exist in res calendar');
                } else if (existed_Events.items.length > 1) {
                    log('Error: res calendar has multiple busy blocks link to same event_id');
                } else { // existed_Events.items.length === 1
                    const event_to_delete = existed_Events.items[0]; 
                    Calendar.Events.remove(res_calendarID, event_to_delete.id); // remove this event
                    log('Successfully remove a single event/recurring all event in res calendar');
                }
                continue;

            }
            else { // if event is created/changed

                // Case 1: if it is a recurring event
                if ((!event.recurrence) ^ (!event.recurringEventId)) {
                    if (!res_recur_event_id) { // if there's no existed event in res calendar
                        log('Trying to create a new recurring event ====')
                        create_one_recur_event(res_calendarID, busy_block_Title, event);
                    } else { // else: change/update a recurring event
                        log('Trying to change a recurring event======')
                        change_recur_event(res_calendarID, res_recur_event_id, busy_block_Title, event);
                    }
                    continue;
                }

                // Case 2: if it is a single event
                log('single event: %s, %s', event.recurrence, event.recurringEventId);
                log('Trying to create/change a single event=====')

                // Case 2.1: if it is an all-day event
                if (event.start.date) {
                    // check if event existed in res calendar
                    const existed_Events = search_res_event(res_calendarID, event.id);
                    if (existed_Events === null) { // if event does not exist in res calendar
                        // create all-day block in res calendar
                        create_allday_event(res_calendarID, busy_block_Title, event);
                        log('Create new all-day event %s', event.start.date);
                    } else if (existed_Events.items.length > 1) {
                        log('Error: res calendar has multiple all-day busy blocks link to same event_id');
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
                        log(`Change an all-day event, ID: %s`, event_to_change.id);
                    }
                    continue;
                }

                // Case 2.2: if it is a timed event
                const existed_Events = search_res_event(res_calendarID, event.id); // check if event existed in res calendar
                if (existed_Events === null) { // create new block in res calendar
                    // create timed block in res calendar
                    create_timed_event(res_calendarID, busy_block_Title, event);
                    log('Create new timed event %s', event.start.dateTime);
                } else if (existed_Events.items.length > 1) {
                    log('Error: Existed multiple timed busy blocks link to same event_id in src calendar');
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
                    log('Change a timed event, ID: %s', event_to_change.id);
                }
            }
        }

        pageToken = events.nextPageToken; // update pageToken

    } while (pageToken); // continue if there is next page

    console.log('updated syncToken: %s', events.nextSyncToken);
    properties.setProperty('syncToken', events.nextSyncToken);

}

/**
* Function to find an event in res calendar and return the 
* event list found
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - src_event_ID: the source event ID
* 
* Returns:
* - return event lists (if no events found: return null)
* 
*/
function search_res_event(res_calendar_ID, src_event_ID) {
    const res_events = Calendar.Events.list(res_calendar_ID,
        {
            sharedExtendedProperty: 'src_event_id=' + src_event_ID
        }
    );

    if (!res_events || res_events.items.length === 0) {
        log('No existed busy blocks found in res calendar.');
        return null;
    }

    log('Number of event found with extended property: %d', res_events.items.length);
    for (const event of res_events.items) {
        log('res event shared extended property: %s', event.extendedProperties);
    }

    return res_events;
}


/**
* Function to create a timed event
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - busy_block_Title
* - src_event: source event
* 
* Returns:
* - None
* 
*/
function create_timed_event(res_calendar_ID, busy_block_Title, src_event) {
    // event details for creating event.
    let event = {
        summary: busy_block_Title,
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
        log('Create res event, ID: %s', event.id);
    } catch (err) {
        log('Failed with error: %s', err.message);
    }

}

/**
* Function to create an all-day event
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - busy_block_Title
* - src_event: source event
* 
* Returns:
* - None
* 
*/
function create_allday_event(res_calendar_ID, busy_block_Title, src_event) {
    // event details for creating event.
    let new_event = {
        summary: busy_block_Title,
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
        log('Create res event, ID: %s', new_event.id);
    } catch (err) {
        log('Failed with error: %s', err.message);
    }

}

/**
* Function to create a recurring event
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - busy_block_Title
* - src_event: source event
* 
* Returns:
* - None
* 
*/
function create_one_recur_event(res_calendar_id, busy_block_Title, src_event) {
    // if it is an all-day recurring event
    if (src_event.start.date) {
        Calendar.Events.insert({
            summary: busy_block_Title,
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
        log('Create an all-day recurring event');

    } else { // if it is a timed recurring event
        Calendar.Events.insert({
            summary: busy_block_Title,
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
        log('Create a timed recurring event');
    }

}

/**
* Function to change a recurring event
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - res_recur_event_id: recurring events id in res calendar
* - busy_block_Title
* - src_event: source event
* 
* Returns:
* - None
*/
function change_recur_event(res_calendar_id, res_recur_event_id, busy_block_Title, src_event) {
    let instance;
    // try to access orignalStart time; if error ==> change this and following
    try {
        log('src_event id :%s', src_event.id);
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
            log('Error: could not find corresponding event in res calendar');
            return; // break out of the function
        } else if (instance.items.length > 1) {
            log('Error: more than one corresponding events in res calendar');
            return; // break out of the function
        } else { // instance.items.length === 0
            instance = instance.items[0]
        }

        const rec_rule = src_event.recurrence ? src_event.recurrence : "";
        log('recurrence rule: %s', rec_rule);

        if (src_event.start.date) { // if it is an all-day recurring event
            Calendar.Events.update(
                {
                    summary: busy_block_Title,
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
            log('Successfully patch an all-day recurring event');
        } else { // it is a timed recurring event
            Calendar.Events.update(
                {
                    summary: busy_block_Title,
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
            log('Successfully patch a timed recurring event');
        }

    } catch (err) { // changes have been made to recurring event by 'this and following'
        log('original time not defined error======');

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
                    summary: busy_block_Title,
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
            log('update an all-day recurring event');
        } else {
            Calendar.Events.update(
                {
                    summary: busy_block_Title,
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
            log('update a timed recurring event');
        }

    }
}


/**
* Function to search recurring event id in the res calendar
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - src_event_id: event id in source calendar
* - src_recur_event_id: recurring event id in source calendar
* 
* Returns:
* - res_recur_event_id: recurring event id in the res calendar
*/
function search_recur_event_id(res_calendarID, src_event_id, src_recur_event_id) {
    let res_recur_event_id = null;
    // determine the real source recurring Event id
    let recurringEventId;
    if (src_event_id && src_recur_event_id) {
        recurringEventId = src_recur_event_id;
    } else {
        recurringEventId = src_event_id;
    }

    // search source recurring Event id in res calendar at shared extended properites
    log('Search for shared properties in res calendar========');
    const events = Calendar.Events.list(res_calendarID,
        {
            sharedExtendedProperty: 'src_event_id=' + recurringEventId,
            maxResults: 1
        }
    );

    if (!events || events.items.length === 0) {
        log('No recurring events found in res calendar');
        return res_recur_event_id;
    } else {
        res_recur_event_id = events.items[0].id;
    }

    for (const event of events.items) {
        log('event shared extended property in res calendar: %s', event.extendedProperties);
        log('recurring event id in res calendar: %s', event.recurringEventId);
        log('recurrence rule in res calendar: %s', event.recurrence);
        log('event id in res calendar: %s', event.id);
    }

    return res_recur_event_id;
}

/**
* Function to cancel a recurring event in the res calendar
* 
* Arguments:
* - res_calendar_ID: result calendar ID
* - res_recur_event_id: recurring events id in res calendar
* - src_event: source event
* 
* Returns:
* - None
*/
function cancel_recur_event(res_calendar_id, res_recur_event_id, src_event) {

    let instance;
    log('src event original start %s', src_event.originalStartTime.dateTime)
    log('src_event id :%s', src_event.id);

    // if it is an all-day recurring event
    if (src_event.originalStartTime.date) { 
        console.log('it is an all-day event')
        instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
            {
                originalStart: src_event.originalStartTime.date
            }
        );
    } else { // if it is a timed event
        log('it is a timed event')
        instance = Calendar.Events.instances(res_calendar_id, res_recur_event_id,
            {
                originalStart: src_event.originalStartTime.dateTime
            }
        );
        log('instance length: %d', instance.items.length)
    }

    if (instance.items.length === 0) {
        log('Error: could not find corresponding event in res calendar');
        return; 
    } else if (instance.items.length > 1) {
        log('Error: more than one corresponding events in res calendar');
        return; 
    } else { // instance.items.length === 0
        instance = instance.items[0]
    }

    // if it is an all-day event
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
    } else { // if it is a timed event
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
    log('Successfully cancelled one recurring event exception, id: %s', instance.id);

}
