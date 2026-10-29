# User Stories

## User Definitions

### Cataloging Administrator

This character is the database administrator who will receive near-match records from the office which distributes them and loads them up into the queue database for the cataloger to process.

### Cataloging Student Worker

This character is the cataloger who will be accepting or rejecting match candidates (near-match --> accept or reject candidates from compiled-records list.)

## Cataloging Administrator Stories

### Authentication

* As the library administrator, I would like straightforward authentication for my role.

*This will require role-based authentication, which we will probably have to manifest in the database architecture.*

### Importing and Uploading Records

* As the library administrator, I would like the ability to upload new near-match records into the catalogers' queues.
* As a library staff member, I need to:

  * Import quarterly catalog update spreadsheets in order to keep the system up to date.
  * View imported catalog records in order to verify that the new information was properly processed.

### Upload History

* As the library administrator, I would like the ability to view the history of the files which I have uploaded.

### Cataloging Queue

* As the library administrator, I would like to view the near-match items that are currently in the cataloging queue.
* As the library admin, I would like to be able to select and delete items from the cataloging queue individually, in batches, and be able to clear currently highlighted records for a given operation.

### Data Management

* As a library staff member, I need:

  * The system to validate uploaded spreadsheet in order to identify missing, invalid, or incorrectly formatted data.
  * The system to preserve the original catalog information in order to ensure that automated processing does not alter source data.
  * To see the source spreadsheet associated with a record in order to trace the record back to the original data.
  * The system to prevent duplicate records from being unnecessarily added in order to keep the combined database accurate.

### Automation

* As a library staff member, I need:

  * Potential matches to be ranked by their likelihood of being a match.

### Accountability

* As a library staff member, I need:

  * To record why a potential match was rejected or accepted in order to provide a comprehensive history of decisions made.
  * To see who reviewed a potential match in order to maintain accountability for changes.
  * To see the status of quarterly data in order to monitor whether or not the process has been completed.
  * To review processing results and error reports in order to identify problems with the importing or matching process.

### Processed Data

* As a library staff member, I need:

  * Store the processed and reviewed data in order to use the results in other library systems.

### Training and Usability

* As a hirer and trainer of future employees, I need the software to be intuitive in order to reduce onboarding time for student workers.

## Cataloging Student Worker Stories

### Authentication

* As a cataloger, I would like straightforward authentication into my cataloging account.

*We will probably use auth tokens for something like that.*

### Reviewing Potential Matches

* As a cataloger, I would like the option to compare near matches side-by-side for an efficient differential.
* As a library staff member, I need:

  * View the details of a potential match to determine whether the entries represent the same item.
  * Accept or reject potential matches
  * See which records have already been reviewed.
  * Identify records that have no potential matches in order to determine which entries can be added without needing additional review.

### Data Presentation

* As a cataloger, I would like clearly labelled data to operate on.
* As a cataloger, I would like to have a side-by-side view of the Near-Match data and the Compiled Lists

*Let's validate the quality of the UI with the catalogers. It may be best if we propose several UI options and let them pick their favorite, or choose to modify the best candidate.*

*I imagine some variation in preference will arise when considering the UI element to select the near-match item currently being checked. We will try to organize these near-match items in the queue in a helpful way.*
