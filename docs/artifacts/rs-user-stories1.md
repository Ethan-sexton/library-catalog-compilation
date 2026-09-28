# Character One: Catalogging Catarina

This character is the catalogger who will be accepting or rejecting match candidates (near-match --> accept or reject candidates from compiled-records list.)

    As a catalogger, I would like a persistent record of items which I 
    have accepted or rejected. 

We can access fuzzy matches with queires, so we won't need to store the candidate matches of these records. 

    As a catalogger, I would like the option to compare near matches
    side-by-side for an effificent differential.
\\

    As a catalogger, I would like straightforward authentication into my 
    catalogging account. 
We will probably use auth tokens for something lke that. 

    As a catalogger, I would like clear button options to accept or reject
    matches from the compiled records. 
\\

    As a catalogger, I would like clearly labelled data to operate on.

Let's validate the quality of the UI with the cataloggers. It may be best if we propose several UI options and let them pick their favorite, or choose to modify the best candidate.

I imagine some variation in preference will arise when considering the UI element to select the near-match item currently being checked. We will try to organize these near-match items in the queue in a helpful way. 


# Character Two: Library-Loading Leslie
This character (all references to real-life people are purely coincidental) is the database administrator who will receive near-match records from the office which distributes them and loads them up into the queue database for the catalogger to process. 

    As the library administrator, I would like straightforward 
    authentication for my role. 

This will require role-based authentication, which we will probably have to manifest in the database architecture. 

    As the library administrator, I would like the ability to
    upload new near-match records into the cataloggers' queues. 

\\

    As the library administrator, I would like the ability to view the 
    history of the files which I have uploaded.

\\

    As the library administrator, I would like to view the near-match items
    that are currently in the catalogging queue. 
\\

    As the library admin, I would like to be able to select and delete items 
    from the catalogging queue individually, in batches, and be able to clear
    currently highlighted records for a given operation. 
