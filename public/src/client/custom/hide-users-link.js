'use strict';

/*
 * Custom script to simplify the registration process:
 * 1. Auto-checks both consent checkboxes
 * 2. Removes the entire second div about data collection while keeping the email div
 */

$(document).ready(function() {
    // For the registration page with multiple steps
    setTimeout(function() {
        // Auto-check both consent checkboxes
        $('#gdpr_agree_data').prop('checked', true);
        $('#gdpr_agree_email').prop('checked', true);

        // Hide the entire second container div about data collection
        $('.panel-body').each(function(index) {
            // Get the text content of this panel
            var panelText = $(this).text();

            // If this panel contains specific text about data collection, hide it
            if (panelText.indexOf("This community forum collects and processes your personal information") > -1) {
                // Hide the entire container - this div and its parent
                $(this).closest('.panel').hide();
            }
        });

        // Alternative selector targeting approach based on the screenshot
        $('.panel-body, .card-body').each(function() {
            if ($(this).find('p').first().text().indexOf("This community forum collects and processes your personal information") > -1) {
                $(this).closest('.panel, .card').hide();
            }
        });

        // Using the structure from the screenshot
        $('div.mb-3').each(function() {
            var firstP = $(this).find('p').first();
            if (firstP.length && firstP.text().trim() === "This community forum collects and processes your personal information.") {
                $(this).hide();
            }
        });
    }, 150);
});