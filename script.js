// Function to read a CSV file using Papaparse
function readCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.errors.length > 0) {
                    console.error("CSV Parsing Errors:", results.errors);
                     // Filter out common newline errors if strict error handling isn't needed for them
                     const criticalErrors = results.errors.filter(err => err.code !== "UndetectableDelimiter");
                     if (criticalErrors.length > 0) {
                        reject(criticalErrors);
                     } else {
                        resolve(results.data); // Resolve even with minor errors like delimiter issues on empty lines
                     }
                } else {
                    resolve(results.data);
                }
            },
            error: function(err) {
                reject(err);
            }
        });
    });
}

// Function to read an Excel file using SheetJS
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Try to find specific sheets first, fallback to first sheet
            let sheetName = workbook.SheetNames[0]; // Default to first sheet
            if (file.name.includes('Non_OHIP') && workbook.SheetNames.includes('Report (NOT for printing)')) {
                sheetName = 'Report (NOT for printing)';
            } else if (file.name.includes('MRP_Conversion') && workbook.SheetNames.includes('Sheet1')) {
                sheetName = 'Sheet1';
            } else {
                console.warn(`Using the first sheet '${sheetName}' for file ${file.name}. Specific sheet names ('Report (NOT for printing)', 'Sheet1') not found or file name doesn't match.`);
            }

            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) {
                 reject(`Sheet '${sheetName}' not found in ${file.name}.`);
                 return;
            }
            // Convert sheet to array of arrays
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            resolve(jsonData); // Returning raw JSON array of arrays
        };
        reader.onerror = function(error) {
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });
}

// Helper to set status message
function setStatus(elementId, message, type = 'info') {
    const statusElement = document.getElementById(elementId);
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}-status`; // Apply status type class

    // Add loading spinner only if type is 'info' (implies processing)
    if (type === 'info') {
        statusElement.classList.add('loading-spinner');
    } else {
         statusElement.classList.remove('loading-spinner');
    }
}


// Function to collect all inputs from the form
async function collectInputs() {
    const hospitalistDataFile = document.getElementById('hospitalist-data-file').files[0];
    const mondayPrepFile = document.getElementById('monday-prep-file').files[0];
    const nonOhipFile = document.getElementById('non-ohip-file').files[0];
    const conversionFile = document.getElementById('conversion-file').files[0];

    const newAdmissions = parseInt(document.getElementById('new-admissions').value, 10) || 0;
    const mrpsThisWeekInput = document.getElementById('mrps-this-week').value.trim();
    const forcedPatientTransfersInput = document.getElementById('forced-patient-transfers').value.trim();
    const forcedMrpTransfersInput = document.getElementById('forced-mrp-transfers').value.trim();

    // Basic validation
    if (!hospitalistDataFile || !mrpsThisWeekInput) {
        setStatus('processing-status', "Please upload the main Hospitalist Data file and enter This Week's MRPs.", 'warning');
        return null;
    }

    // --- Client-side format validation for parameters ---
    const mrpRegex = /^[A-Z]+(-\d+)?$/i; // Matches MRP like CHUGA or GOTSI-16
    const mrpsArray = mrpsThisWeekInput.split(',').map(mrp => mrp.trim()).filter(mrp => mrp !== '');
    if (mrpsArray.length === 0) {
         setStatus('processing-status', "This Week's MRPs cannot be empty after trimming.", 'warning');
         return null;
    }
    for (const mrp of mrpsArray) {
        if (!mrpRegex.test(mrp)) {
             setStatus('processing-status', `Invalid MRP format found in "This Week's MRPs": ${mrp}. Expected format: NAME or NAME-CAP.`, 'warning');
             return null;
        }
    }

    const patientTransferRegex = /^E\d+->[A-Z]+$/i; // Matches MRN->MRP like E001234567->CHUGA
    const forcedPatientTransfers = [];
    if (forcedPatientTransfersInput) {
        const transfers = forcedPatientTransfersInput.split(';').map(t => t.trim()).filter(t => t !== '');
        for (const transfer of transfers) {
            if (!patientTransferRegex.test(transfer)) {
                 setStatus('processing-status', `Invalid format in "Forced Patient Transfers": ${transfer}. Expected format: MRN->MRP (e.g., E001234567->CHUGA).`, 'warning');
                 return null;
            }
            const [mrn, mrp] = transfer.split('->');
            forcedPatientTransfers.push({ mrn: mrn.toUpperCase(), mrp: mrp.toUpperCase() });
        }
    }

    const mrpTransferRegex = /^[A-Z]+->[A-Z]+(\/[A-Z]+)?$/i; // Matches OLD->NEW or OLD->NEW1/NEW2
    const forcedMrpTransfers = [];
    if (forcedMrpTransfersInput) {
        const transfers = forcedMrpTransfersInput.split(';').map(t => t.trim()).filter(t => t !== '');
        for (const transfer of transfers) {
            if (!mrpTransferRegex.test(transfer)) {
                 setStatus('processing-status', `Invalid format in "Forced MRP Transfers": ${transfer}. Expected format: OLD->NEW or OLD->NEW1/NEW2 (e.g., HALKE->YEEAN; NIUJI->MUSRO/DANKAR).`, 'warning');
                 return null;
            }
            const [oldMrp, newMrpSpec] = transfer.split('->');
             forcedMrpTransfers.push({ old_mrp: oldMrp.toUpperCase(), new_mrp_spec: newMrpSpec.toUpperCase() }); // Let backend handle spec parsing (NEW or NEW1/NEW2)
        }
    }
     // --- End client-side format validation ---


    // Read files and parse them
    try {
        const hospitalistData = await readCSVFile(hospitalistDataFile);
        let mondayPrepData = null;
        if (mondayPrepFile) {
            mondayPrepData = await readCSVFile(mondayPrepFile);
        }
        let nonOhipData = null;
         if (nonOhipFile) {
             // Read Excel as array of arrays
             const excelData = await readExcelFile(nonOhipFile);
              // Simple processing to get the two relevant columns
              nonOhipData = []; // Initialize as empty array
              if (excelData && excelData.length > 1) {
                   const headerRow = excelData[0]; // Assuming header is the first row
                   // Look for header cell containing 'Hospitalist' or 'Unnamed: 1' case-insensitively and trimmed
                   const hospitalistColIndex = headerRow.findIndex(h => h && String(h).trim().toLowerCase().includes('hospitalist'));
                   // Look for header cell containing 'Proportional' or 'Unnamed: 3' case-insensitively and trimmed
                   const proportionalColIndex = headerRow.findIndex(h => h && String(h).trim().toLowerCase().includes('proportional'));


                   if (hospitalistColIndex !== -1 && proportionalColIndex !== -1) {
                       for (let i = 1; i < excelData.length; i++) { // Start from 1 to skip header
                           const row = excelData[i];
                           if (row && row[hospitalistColIndex] !== undefined && row[proportionalColIndex] !== undefined) {
                               const hosp = String(row[hospitalistColIndex]).trim();
                               const prop = String(row[proportionalColIndex]).trim();
                                // Only include rows where Hospitalist is not empty and Proportional value is not 'Proportional' itself
                                if (hosp && prop && prop.toLowerCase() !== 'proportional') {
                                    const propValue = parseFloat(prop);
                                    if (!isNaN(propValue)) {
                                        nonOhipData.push({ Hospitalist: hosp, Proportional: propValue });
                                    } else {
                                        console.warn(`Skipping row ${i+1} in Non-OHIP: Invalid Proportional value "${prop}"`);
                                    }
                                } else if (hosp && prop.toLowerCase() === 'proportional') {
                                     // Explicitly ignore rows marked "Proportional" as intended
                                    console.log(`Skipping row ${i+1} in Non-OHIP: Marked as "Proportional"`);
                                } else {
                                     console.warn(`Skipping row ${i+1} in Non-OHIP: Missing Hospitalist or Proportional value`);
                                }
                           }
                       }
                       console.log(`Successfully parsed ${nonOhipData.length} valid Non-OHIP entries.`);
                   } else {
                        console.warn("Could not find expected 'Hospitalist'/'Unnamed: 1' or 'Proportional'/'Unnamed: 3' columns in Non-OHIP file. Ensure headers are present and correctly named.");
                   }
             } else {
                 console.warn("Non-OHIP Excel file is empty or has no data rows.");
             }
         }

        let conversionData = null;
         if (conversionFile) {
             // Read Excel as array of arrays
             const excelData = await readExcelFile(conversionFile);
              // Simple processing to get Hospitalist and MRP columns
              conversionData = []; // Initialize as empty array
              if (excelData && excelData.length > 1) {
                   const headerRow = excelData[0]; // Assuming header is the first row
                    // Look for header cell containing 'Hospitalist' case-insensitively and trimmed
                   const hospitalistColIndex = headerRow.findIndex(h => h && String(h).trim().toLowerCase().includes('hospitalist'));
                    // Look for header cell containing 'MRP' case-insensitively and trimmed
                   const mrpColIndex = headerRow.findIndex(h => h && String(h).trim().toLowerCase() === 'mrp');


                   if (hospitalistColIndex !== -1 && mrpColIndex !== -1) {
                       for (let i = 1; i < excelData.length; i++) { // Start from 1 to skip header
                           const row = excelData[i];
                           if (row && row[hospitalistColIndex] !== undefined && row[mrpColIndex] !== undefined) {
                               const hosp = String(row[hospitalistColIndex]).trim();
                               const mrp = String(row[mrpColIndex]).trim();
                                if (hosp && mrp) {
                                   conversionData.push({ Hospitalist: hosp, MRP: mrp });
                                } else {
                                     console.warn(`Skipping row ${i+1} in Conversion: Missing Hospitalist or MRP value`);
                                }
                           }
                       }
                       console.log(`Successfully parsed ${conversionData.length} valid Conversion entries.`);
                   } else {
                        console.warn("Could not find expected 'Hospitalist' or 'MRP' columns in Conversion file. Ensure headers are present and correctly named.");
                   }
              } else {
                  console.warn("Conversion Excel file is empty or has no data rows.");
              }
         }


        return {
            hospitalistData: hospitalistData,
            mondayPrepData: mondayPrepData,
            nonOhipData: nonOhipData, // Already filtered/processed
            conversionData: conversionData, // Already filtered/processed
            newAdmissions: newAdmissions,
            mrpsThisWeek: mrpsThisWeekInput, // Send raw string, backend parses caps
            forcedPatientTransfers: forcedPatientTransfers, // Send as processed array [{mrn, mrp}]
            forcedMrpTransfers: forcedMrpTransfers, // Send as processed array [{old_mrp, new_mrp_spec}]
        };

    } catch (error) {
        console.error("Error reading files:", error);
        setStatus('processing-status', `Error reading files: ${error.message || error}. Please check file format and try again.`, 'error');
        return null;
    }
}

// Function to display results (this would typically come from the backend)
function displayResults(results) {
    const summaryDisplay = document.getElementById('summary-display');
    const patientListDisplay = document.getElementById('patient-list-display');
    const outputSection = document.getElementById('output-section');

    // Clear previous results, but keep headers/hints
    summaryDisplay.querySelector('div') ? summaryDisplay.querySelector('div').remove() : null;
    patientListDisplay.querySelector('table') ? patientListDisplay.querySelector('table').remove() : null;


    // --- Display Summary ---
    if (results && results.summary && results.summary.length > 0) {
         const summaryTable = document.createElement('table');
          // Assuming summary data has consistent keys for headers
         const summaryHeaders = Object.keys(results.summary[0]);
         summaryTable.innerHTML = `
             <thead>
                 <tr>
                     ${summaryHeaders.map(header => `<th>${header.replace(/_/g, ' ')}</th>`).join('')}
                 </tr>
             </thead>
             <tbody>
                 ${results.summary.map(row => `
                     <tr>
                         ${summaryHeaders.map(header => `<td>${row[header] !== undefined ? row[header] : ''}</td>`).join('')}
                     </tr>
                 `).join('')}
             </tbody>
         `;
         summaryDisplay.appendChild(summaryTable);
    } else {
        const p = document.createElement('p');
        p.textContent = 'No summary data available from backend.';
        p.classList.add('info'); // Use info style for messages
        summaryDisplay.appendChild(p);
    }


    // --- Display Patient List (Interactive Example) ---
     if (results && results.redistributed_data && results.redistributed_data.length > 0) {
         const patientTable = document.createElement('table');
          // Define columns to display in the frontend table
          // Ensure New_MRP is included if it exists
          const displayCols = ["Patient_ID", "MRN", "Name", "Location", "RmBed", "Service", "LoS >34", "Insurance", "MRP", "New_MRP", "Saturday_MRP", "Sunday_MRP"].filter(col =>
               results.redistributed_data[0] && results.redistributed_data[0].hasOwnProperty(col)
          ); // Only show columns that exist in the data

         patientTable.innerHTML = `
             <thead>
                 <tr>
                    ${displayCols.map(col => `<th>${col.replace(/_/g, ' ')}</th>`).join('')}
                 </tr>
             </thead>
             <tbody>
                 ${results.redistributed_data.map((row, index) => {
                      // Store original index for editing later
                      const mrn = row.MRN || row.Patient_ID || `row-${index}`; // Unique identifier for row
                      return `
                          <tr data-index="${index}" data-mrn="${mrn}">
                              ${displayCols.map(col => {
                                   const cellContent = row[col] !== undefined ? row[col] : '';
                                   // Make New_MRP cell editable
                                   if (col === "New_MRP") {
                                       return `<td contenteditable="true" title="Click to edit MRP">${cellContent}</td>`;
                                   }
                                   return `<td>${cellContent}</td>`;
                              }).join('')}
                          </tr>
                      `;
                 }).join('')}
             </tbody>
         `;
         patientListDisplay.appendChild(patientTable);

          // Add event listener for manual edits on New_MRP cells
          const newMrpColIndex = displayCols.indexOf("New_MRP");
          if(newMrpColIndex !== -1) {
               patientTable.querySelectorAll(`tbody tr`).forEach(row => {
                   const mrpCell = row.cells[newMrpColIndex];

                    // Optional: Add visual feedback on focus/blur
                   mrpCell.addEventListener('focus', (event) => {
                       event.target.classList.add('editing');
                   });
                   mrpCell.addEventListener('blur', (event) => {
                       event.target.classList.remove('editing');
                       const rowIndex = parseInt(row.dataset.index, 10);
                       const newValue = event.target.textContent.trim().toUpperCase();
                       const mrn = row.dataset.mrn; // Get identifier

                       // Update the data model in results.redistributed_data
                       if (results.redistributed_data[rowIndex]) {
                            results.redistributed_data[rowIndex]["New_MRP"] = newValue;
                           console.log(`Manual edit: Patient MRN ${mrn} (index ${rowIndex}) set to ${newValue}`);
                            // Note: In a real app, you might need to send this edit to the backend
                            // or store edits separately to apply before generating reports.
                            // For this simulation, we just modify the displayed data structure.
                       } else {
                            console.warn(`Could not find data for row index ${rowIndex} to update.`);
                       }

                   });

                   // Prevent newlines in editable cells
                   mrpCell.addEventListener('keypress', (event) => {
                       if (event.key === 'Enter') {
                           event.preventDefault(); // Prevent new line
                           event.target.blur(); // Trigger blur to save edit
                       }
                   });
               });
          }

     } else {
        const p = document.createElement('p');
        p.textContent = 'No patient list data available from backend.';
         p.classList.add('info'); // Use info style for messages
        patientListDisplay.appendChild(p);
     }

    outputSection.classList.remove('hidden');
    // Show generate reports button only if there's patient data
     if (results && results.redistributed_data && results.redistributed_data.length > 0) {
        document.getElementById('generate-reports-button').disabled = false;
     } else {
         document.getElementById('generate-reports-button').disabled = true;
     }
}

// Function to display download links
function displayDownloadLinks(files) {
    const downloadList = document.getElementById('download-links');
    const downloadSection = document.getElementById('download-section');

    downloadList.innerHTML = ''; // Clear previous links

    if (files && files.length > 0) {
        files.forEach(file => {
            const listItem = document.createElement('li');

             // In a real backend, you'd get actual file URLs or base64 content
             // This is a simulation using dummy content
             const dummyContent = `Simulated content for ${file.name}`;
             const blob = new Blob([dummyContent], { type: file.type || 'text/plain' });
             const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = file.name || 'download'; // Provide a default filename
            link.textContent = `Download ${file.name || 'Generated File'}`;

            // Add a simple icon based on file extension
            let iconClass = 'fas fa-file'; // Default
            if (file.name.toLowerCase().endsWith('.csv')) iconClass = 'fas fa-file-csv';
            else if (file.name.toLowerCase().endsWith('.xlsx')) iconClass = 'fas fa-file-excel';
            else if (file.name.toLowerCase().endsWith('.pdf')) iconClass = 'fas fa-file-pdf';
            const icon = document.createElement('i');
            icon.className = iconClass;
            link.insertBefore(icon, link.firstChild); // Add icon before text

            listItem.appendChild(link);
            downloadList.appendChild(listItem);

            // Clean up the Blob URL after a delay (optional but good practice)
             // setTimeout(() => URL.revokeObjectURL(url), 60000); // Revoke after 60 seconds

        });
         downloadSection.classList.remove('hidden');
    } else {
        downloadSection.classList.add('hidden');
        // No alert here, status message is sufficient
    }
}

// Event Listener for the Process Button
document.getElementById('process-button').addEventListener('click', async () => {
    setStatus('processing-status', 'Collecting inputs and processing...', 'info'); // Show loading indicator

    // Clear previous results and downloads sections immediately
     document.getElementById('output-section').classList.add('hidden');
     document.getElementById('download-section').classList.add('hidden');
     document.getElementById('generate-reports-button').disabled = true; // Disable generate button


    const inputs = await collectInputs(); // collectInputs now sets status messages

    if (!inputs) {
        // Status already set by collectInputs if it returned null
        return;
    }

    console.log("Collected Inputs:", inputs);

    // --- SIMULATED BACKEND CALL ---
    // In a real application, you would send 'inputs' to your Python backend here
    // using fetch() or XMLHttpRequest.
    /*
    fetch('/process', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputs),
    })
    .then(response => {
        if (!response.ok) {
             // Handle HTTP errors
             return response.text().then(text => { throw new Error(text || response.statusText); });
        }
        return response.json();
    })
    .then(data => {
        console.log("Processing complete:", data);
        setStatus('processing-status', 'Processing complete. Review results below.', 'success');
        displayResults(data); // Assuming backend returns JSON with results
    })
    .catch((error) => {
        console.error('Error during processing:', error);
        setStatus('processing-status', `Error during processing: ${error.message}. Check console.`, 'error');
         // Optionally, display a simple error message in the result area
         document.getElementById('summary-display').innerHTML = '<p class="error-status">An error occurred during processing.</p>';
         document.getElementById('patient-list-display').innerHTML = '';
         document.getElementById('output-section').classList.remove('hidden'); // Show section to display error
         document.getElementById('generate-reports-button').disabled = true; // Keep disabled
    });
    */

    // --- FRONTEND-ONLY SIMULATION ---
    // Since we don't have a backend here, we'll just log inputs and show some dummy output sections.
    // You CANNOT run the actual Python logic here in the browser.
    console.warn("Backend processing is simulated. The actual redistribution logic from lead156.py requires a server.");

     // Simulate processing delay
     await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate 1 second delay


     // Simulate successful processing and show output section
     setStatus('processing-status', 'Inputs collected. Backend processing simulated.', 'warning');

    // Create dummy results structure similar to what a backend might return
    // This does NOT reflect the actual distribution logic!
    const dummyResults = {
         summary: [
             { New_MRP: 'CHUGA', Patient_Count: 10, ALC_Long_Stays: 2, Non_ALC_Long_Stays: 1, Non_OHIP: 1, New_Patients: 3, Weekend_Continuity: 4, Last_Week_Patients: 5 },
             { New_MRP: 'WOOMIN', Patient_Count: 8, ALC_Long_Stays: 0, Non_ALC_Long_Stays: 1, Non_OHIP: 2, New_Patients: 2, Weekend_Continuity: 3, Last_Week_Patients: 4 },
             { New_MRP: 'MUSRO', Patient_Count: 9, ALC_Long_Stays: 1, Non_ALC_Long_Stays: 0, Non_OHIP: 0, New_Patients: 4, Weekend_Continuity: 2, Last_Week_Patients: 6 },
             { New_MRP: 'TOTAL', Patient_Count: 27, ALC_Long_Stays: 3, Non_ALC_Long_Stays: 2, Non_OHIP: 3, New_Patients: 9, Weekend_Continuity: 9, Last_Week_Patients: 15 },
         ],
         // Simulate a simple patient list based on uploaded data (without redistribution)
         redistributed_data: inputs.hospitalistData.slice(0, 30).map((patient, index) => { // Use up to 30 patients for a better table demo
             // Add dummy New_MRP for demonstration
             const mrps = inputs.mrpsThisWeek.split(',').map(m => m.split('-')[0].trim().toUpperCase()).filter(m => m);
             const assigned_mrp = mrps.length > 0 ? mrps[index % mrps.length] : 'UNASSIGNED';

              // Add dummy weekend MRPs for demonstration
              const weekend_mrp = mrps.length > 0 ? mrps[(index + 1) % mrps.length] : 'NONE';

             // Add some dummy flags/values
             const los = patient["LoS >34"] || (index % 5 === 0 ? 'Y' : 'N'); // Simulate LoS flag
              const insurance = patient["Insurance"] || (index % 7 === 0 ? 'NON-OHIP' : 'OHIP'); // Simulate Insurance

             return {
                  ...patient, // Keep original fields
                   "Patient_ID": patient["Patient ID"] || patient["Patient_ID"] || `P${1000 + index}`, // Ensure a patient ID field
                  "MRN": patient["MRN"] || patient["Patient MRN"] || `E${100000000 + index}`, // Ensure MRN field
                   "LoS >34": los,
                  "Insurance": insurance,
                  "MRP": patient["MRP"] || mrps.length > 0 ? mrps[(index + 2) % mrps.length] : 'OLD_MRP', // Simulate existing MRP
                  "New_MRP": assigned_mrp, // Add dummy assignment
                   "Saturday_MRP": index % 3 === 0 ? weekend_mrp : null, // Add some weekend data
                   "Sunday_MRP": index % 4 === 1 ? weekend_mrp : null, // Add some weekend data
             };
         })

    };
     displayResults(dummyResults); // Show the dummy results
});

// Event Listener for the Generate Reports Button
document.getElementById('generate-reports-button').addEventListener('click', async () => {
    setStatus('report-status', 'Generating final reports...', 'info'); // Show loading indicator
    document.getElementById('download-section').classList.add('hidden'); // Hide previous downloads

    // In a real application, you would get the current state of the patient data
    // potentially including manual edits made in the patient list display.
    // For this simulation, we'll just indicate this is where you'd send the data.

    // Retrieve current patient data from the displayed results structure
     // This assumes displayResults populated results.redistributed_data
     const currentPatientData = window._lastRedistributionResults ? window._lastRedistributionResults.redistributed_data : null;

     if (!currentPatientData || currentPatientData.length === 0) {
         setStatus('report-status', 'No patient data available to generate reports.', 'warning');
         return;
     }

     console.log("Generating reports with current patient data (including manual edits):", currentPatientData);

    // --- SIMULATED BACKEND CALL ---
    /*
    fetch('/generate_reports', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patientData: currentPatientData }), // Send the data including edits
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => { throw new Error(text || response.statusText); });
        }
        return response.json(); // Assuming backend sends back file paths/data URLs in JSON
    })
    .then(data => {
        console.log("Reports generated:", data);
         setStatus('report-status', 'Reports generated successfully. Download below.', 'success');
         displayDownloadLinks(data.files); // Assuming data.files is an array of { name, url/content }
    })
    .catch((error) => {
        console.error('Error generating reports:', error);
         setStatus('report-status', `Error generating reports: ${error.message}. See console for details.`, 'error');
         document.getElementById('download-section').classList.add('hidden'); // Hide download section on error
    });
    */

    // --- FRONTEND-ONLY SIMULATION ---
     console.warn("Backend report generation is simulated. PDF/Excel generation requires a server running lead156.py logic.");

     // Simulate generation delay
     await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate 1.5 second delay

    // Simulate successful report generation and show download links
     setStatus('report-status', 'Report generation simulated. See download section.', 'warning');

    // Create dummy download links
     const dummyFiles = [
         { name: 'redistributed_hospitalist_data.csv', type: 'text/csv' },
         { name: 'new_mrp_summary.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
         { name: 'combined_patient_lists.pdf', type: 'application/pdf' },
         { name: 'combined_ward_lists.pdf', type: 'application/pdf' },
          { name: 'combined_last_week_mrp_lists.pdf', type: 'application/pdf' },
          { name: 'Distribution_Summary.pdf', type: 'application/pdf' },
     ];
     displayDownloadLinks(dummyFiles); // Show the dummy download links
});

// Store the last results globally (simplistic way for simulation to access edits)
const originalDisplayResults = displayResults;
displayResults = function(results) {
    window._lastRedistributionResults = results; // Store results
    originalDisplayResults(results); // Call original display function
};


// Initially hide output and download sections and disable reports button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('output-section').classList.add('hidden');
    document.getElementById('download-section').classList.add('hidden');
    document.getElementById('generate-reports-button').disabled = true;
    setStatus('processing-status', 'Ready to process inputs.', 'info');
    setStatus('report-status', 'Reports can be generated after processing.', 'info');

     // Add event listeners to file inputs to show selected file name (optional but nice)
     document.querySelectorAll('input[type="file"]').forEach(input => {
         input.addEventListener('change', function() {
             const label = this.previousElementSibling;
             if (this.files && this.files.length > 0) {
                  const fileName = this.files[0].name;
                  label.textContent = `${label.textContent.split(':')[0]}: ${fileName}`;
                  label.style.fontStyle = 'normal'; // Remove italic
             } else {
                  label.textContent = label.textContent.split(':')[0] + ':';
                  label.style.fontStyle = 'italic';
             }
         });
     });
});
