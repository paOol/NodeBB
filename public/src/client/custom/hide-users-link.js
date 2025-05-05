'use strict';

// This script hides the '/users' link from the left navigation menu
$(document).ready(function() {
    // Function to hide users link
    function hideUsersLink() {
        // Find and hide any navigation link that points to the users page
        $('a[href$="/users"]').parent('li').hide();
    }
    
    // Run when document is ready
    hideUsersLink();
    
    // Also run when ajaxify completes (for dynamic navigation updates)
    $(window).on('action:ajaxify.end', function() {
        hideUsersLink();
    });
});