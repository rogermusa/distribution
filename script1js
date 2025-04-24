// Function to read a CSV file using Papaparse
function readCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.errors.length > 0) {
                    console.error("CSV Parsing Errors:", results.errors);
                    reject(results.errors);
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

            // Assuming the relevant data is on the first sheet ('Sheet1' or 'Report')
            let sheetName = workbook.SheetNames[0];
             if (file.name.includes('Non_OHIP') && workbook.SheetNames.includes('Report (NOT for printing)')) {
                 sheetName = 'Report (NOT for printing)';
             } else if (file.name.includes('MRP_Conversion') && workbook.SheetNames.includes('Sheet1')) {
                 sheetName = 'Sheet1';
             } else if (!workbook.SheetNames.includes(sheetName)) {
                  console.warn(`Default sheet '${sheetName}' not found in ${file.name}. Using the first available sheet.`);
                  sheetName = workbook.SheetNames[0];
             }

            const worksheet = workbook.Sheets[sheetName];
            // Convert sheet to JSON, including headers
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            resolve(jsonData); // Returning raw JSON array, backend will handle structure
        };
        reader.onerror = function(error) {
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });
}


// Function to collect all inputs from the form
async function collectInputs() {
    const hospitalistDataFile = document.getElementById('hospitalist-data-file').files[0];
    const mondayPrepFile = document.getElementById('monday-prep-file').files[0];
    const nonOhipFile = document.getElementById('non-ohip-file').files[0];
    const conversionFile = document.getElementById('conversion-file').files[0];

    const newAdmissions = parseInt(document.getElementById('new-admissions').value, 10) || 0;
    const mrpsThisWeek = document.getElementById('mrps-this-week').value.trim();
    const forcedPatientTransfers = document.getElementById('forced-patient-transfers').value.trim();
    const forcedMrpTransfers = document.getElementById('forced-mrp-transfers').value.trim();

    // Basic validation
    if (!hospitalistDataFile || !mrpsThisWeek) {
        alert("Please upload the main Hospitalist Data file and enter This Week's MRPs.");
        return null;
    }

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
              if (excelData && excelData.length > 1) {
                  nonOhipData = [];
                   const headerRow = excelData[0]; // Assuming header is the first row
                   const hospitalistColIndex = headerRow.findIndex(h => h && String(h).trim() === 'Unnamed: 1');
                   const proportionalColIndex = headerRow.findIndex(h => h && String(h).trim() === 'Unnamed: 3');

                   if (hospitalistColIndex !== -1 && proportionalColIndex !== -1) {
                       for (let i = 1; i < excelData.length; i++) { // Start from 1 to skip header
                           const row = excelData[i];
                           if (row && row[hospitalistColIndex] !== undefined && row[proportionalColIndex] !== undefined) {
                               const hosp = String(row[hospitalistColIndex]).trim();
                               const prop = String(row[proportionalColIndex]).trim();
                                if (hosp && prop && prop.toLowerCase() !== 'proportional') {
                                   nonOhipData.push({ Hospitalist: hosp, Proportional: parseFloat(prop) });
                                }
                           }
                       }
                   } else {
                        console.warn("Could not find 'Unnamed: 1' or 'Unnamed: 3' columns in Non-OHIP file.");
                         // Fallback: return all rows if columns not found? Or just null? Let's return null/empty
                         nonOhipData = [];
                   }
             } else {
                 nonOhipData = []; // Empty if no data
             }
         }

        let conversionData = null;
         if (conversionFile) {
             // Read Excel as array of arrays
             const excelData = await readExcelFile(conversionFile);
              // Simple processing to get Hospitalist and MRP columns
              if (excelData && excelData.length > 1) {
                   conversionData = [];
                   const headerRow = excelData[0]; // Assuming header is the first row
                   const hospitalistColIndex = headerRow.findIndex(h => h && String(h).trim() === 'Hospitalist');
                   const mrpColIndex = headerRow.findIndex(h => h && String(h).trim() === 'MRP');

                   if (hospitalistColIndex !== -1 && mrpColIndex !== -1) {
                       for (let i = 1; i < excelData.length; i++) { // Start from 1 to skip header
                           const row = excelData[i];
                           if (row && row[hospitalistColIndex] !== undefined && row[mrpColIndex] !== undefined) {
                               const hosp = String(row[hospitalistColIndex]).trim();
                               const mrp = String(row[mrpColIndex]).trim();
                                if (hosp && mrp) {
                                   conversionData.push({ Hospitalist: hosp, MRP: mrp });
                                }
                           }
                       }
                   } else {
                        console.warn("Could not find 'Hospitalist' or 'MRP' columns in Conversion file.");
                         // Fallback: return null/empty
                         conversionData = [];
                   }
              } else {
                  conversionData = []; // Empty if no data
              }
         }


        return {
            hospitalistData: hospitalistData,
            mondayPrepData: mondayPrepData,
            nonOhipData: nonOhipData,
            conversionData: conversionData,
            newAdmissions: newAdmissions,
            mrpsThisWeek: mrpsThisWeek,
            forcedPatientTransfers: forcedPatientTransfers,
            forcedMrpTransfers: forcedMrpTransfers,
        };

    } catch (error) {
        console.error("Error reading files:", error);
        alert("Error reading files. Please check file format and try again.");
        return null;
    }
}

// Function to display results (this would typically come from the backend)
function displayResults(results) {
    const summaryDisplay = document.getElementById('summary-display');
    const patientListDisplay = document.getElementById('patient-list-display');
    const outputSection = document.getElementById('output-section');

    // Clear previous results
    summaryDisplay.innerHTML = '';
    patientListDisplay.innerHTML = '';

    // --- Display Summary (Basic Example) ---
    // In a real app, the backend would send a structured summary
    if (results && results.summary) {
         const summaryTable = document.createElement('table');
         summaryTable.innerHTML = `
             <thead>
                 <tr>
                     <th>MRP</th>
                     <th>Total</th>
                     <th>ALC LS</th>
                     <th>Non-ALC LS</th>
                     <th>Non-OHIP</th>
                     <th>New</th>
                     <th>Weekend Cont</th>
                     <th>Last Week</th>
                 </tr>
             </thead>
             <tbody>
                 ${results.summary.map(row => `
                     <tr>
                         <td>${row.New_MRP}</td>
                         <td>${row.Patient_Count}</td>
                         <td>${row.ALC_Long_Stays}</td>
                         <td>${row.Non_ALC_Long_Stays}</td>
                         <td>${row.Non_OHIP}</td>
                         <td>${row.New_Patients}</td>
                         <td>${row.Weekend_Continuity}</td>
                         <td>${row.Last_Week_Patients}</td>
                     </tr>
                 `).join('')}
             </tbody>
         `;
         summaryDisplay.appendChild(summaryTable);
    } else {
        summaryDisplay.innerHTML = '<p>No summary data available from backend.</p>';
    }


    // --- Display Patient List (Basic Interactive Example) ---
    // In a real app, this table could be made editable for manual adjustments
     if (results && results.redistributed_data) {
         const patientTable = document.createElement('table');
          // Define columns to display in the frontend table
          const displayCols = ["Patient_ID", "MRN", "Name", "Location", "RmBed", "Service", "LoS >34", "Insurance", "MRP", "New_MRP", "Saturday_MRP", "Sunday_MRP"];
         patientTable.innerHTML = `
             <thead>
                 <tr>
                    ${displayCols.map(col => `<th>${col}</th>`).join('')}
                 </tr>
             </thead>
             <tbody>
                 ${results.redistributed_data.map((row, index) => `
                     <tr data-index="${index}">
                         ${displayCols.map(col => `<td>${row[col] !== undefined ? row[col] : ''}</td>`).join('')}
                     </tr>
                 `).join('')}
             </tbody>
         `;
          patientListDisplay.appendChild(document.createElement('h3')).textContent = 'Patient List';
         patientListDisplay.appendChild(patientTable);

          // Make New_MRP column editable (simplified example)
          const newMrpColIndex = displayCols.indexOf("New_MRP");
          if(newMrpColIndex !== -1) {
               patientTable.querySelectorAll(`tbody tr`).forEach(row => {
                   const mrpCell = row.cells[newMrpColIndex];
                   mrpCell.contentEditable = true; // Make the cell editable
                   mrpCell.title = "Click to edit MRP";
                   mrpCell.style.cursor = "pointer";
                    // Optional: Add event listener to update data model on blur
                   mrpCell.addEventListener('blur', (event) => {
                       const rowIndex = parseInt(row.dataset.index);
                       const newValue = event.target.textContent.trim().toUpperCase();
                       // Update the data model in results.redistributed_data
                       results.redistributed_data[rowIndex]["New_MRP"] = newValue;
                       console.log(`Manual edit: Patient index ${rowIndex} (MRN: ${results.redistributed_data[rowIndex].MRN}) set to ${newValue}`);
                       // Note: In a real app, you'd send this update back to the backend for recalculation/validation
                   });
               });
          }

     } else {
         patientListDisplay.innerHTML = '<p>No patient list data available from backend.</p>';
     }


    outputSection.classList.remove('hidden');
}

// Function to display download links
function displayDownloadLinks(files) {
    const downloadList = document.getElementById('download-links');
    const downloadSection = document.getElementById('download-section');

    downloadList.innerHTML = ''; // Clear previous links

    if (files && files.length > 0) {
        files.forEach(file => {
            const listItem = document.createElement('li');
             // Assuming backend sends file content as Blob URLs or base64
             // For this frontend-only example, we'll simulate links or use temporary Blob URLs
             // In a real backend, you'd link to a server endpoint like /download/filename.pdf
             const blob = new Blob([JSON.stringify(file.content || "Simulated Content")], { type: file.type || 'text/plain' });
             const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = file.name || 'download'; // Provide a default filename
            link.textContent = `Download ${file.name || 'Generated File'}`;
            listItem.appendChild(link);
            downloadList.appendChild(listItem);

            // Clean up the Blob URL after a delay (optional but good practice)
             // setTimeout(() => URL.revokeObjectURL(url), 60000); // Revoke after 60 seconds

        });
         downloadSection.classList.remove('hidden');
    } else {
        downloadSection.classList.add('hidden');
        alert("No files received from the server to download.");
    }
}

// Event Listener for the Process Button
document.getElementById('process-button').addEventListener('click', async () => {
    const statusElement = document.getElementById('processing-status');
    statusElement.textContent = 'Collecting inputs and processing...';
    statusElement.style.backgroundColor = '#e9ecef'; // Default status color

    const inputs = await collectInputs();

    if (!inputs) {
        statusElement.textContent = 'Error during input collection. Please check console for details.';
        statusElement.style.backgroundColor = '#f8d7da'; // Light red for error
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
    .then(response => response.json()) // Or response.blob() or response.text() depending on backend
    .then(data => {
        console.log("Processing complete:", data);
        statusElement.textContent = 'Processing complete. Review results below.';
        statusElement.style.backgroundColor = '#d4edda'; // Light green for success
        displayResults(data); // Assuming backend returns JSON with results
    })
    .catch((error) => {
        console.error('Error:', error);
        statusElement.textContent = 'Error during processing. See console for details.';
        statusElement.style.backgroundColor = '#f8d7da'; // Light red for error
    });
    */

    // --- FRONTEND-ONLY SIMULATION ---
    // Since we don't have a backend here, we'll just log inputs and show some dummy output sections.
    // You CANNOT run the actual Python logic here in the browser.
    console.warn("Backend processing is simulated. The actual redistribution logic from lead156.py requires a server.");

     // Simulate successful processing and show output section
     statusElement.textContent = 'Inputs collected. (Backend simulation only)';
     statusElement.style.backgroundColor = '#fff3cd'; // Light yellow for warning/simulation

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
         redistributed_data: inputs.hospitalistData.slice(0, 20).map((patient, index) => {
             // Add dummy New_MRP for demonstration
             const mrps = inputs.mrpsThisWeek.split(',').map(m => m.split('-')[0].trim().toUpperCase()).filter(m => m);
             const assigned_mrp = mrps.length > 0 ? mrps[index % mrps.length] : 'UNASSIGNED';

              // Add dummy weekend MRPs for demonstration
              const weekend_mrp = mrps.length > 0 ? mrps[(index + 1) % mrps.length] : 'NONE';


             return {
                  ...patient, // Keep original fields
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
    const statusElement = document.getElementById('report-status');
    statusElement.textContent = 'Generating final reports...';
    statusElement.style.backgroundColor = '#e9ecef'; // Default status color

    // In a real application, you would get the current state of the patient data
    // potentially including manual edits made in the patient list display.
    // Let's assume we need the original inputs again for this simulation,
    // or ideally, send the currently displayed patient data back to the backend.

    // --- SIMULATED BACKEND CALL ---
    /*
    // Example: Send the current patient data (if editable) back to the backend
    const currentPatientData = // ... logic to extract data from the interactive table ...

    fetch('/generate_reports', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patientData: currentPatientData }), // Or send initial inputs + manual edits
    })
    .then(response => response.json()) // Assuming backend sends back file paths/data URLs
    .then(data => {
        console.log("Reports generated:", data);
         statusElement.textContent = 'Reports generated successfully. Download below.';
         statusElement.style.backgroundColor = '#d4edda'; // Light green for success
        displayDownloadLinks(data.files); // Assuming data.files is an array of { name, url/content }
    })
    .catch((error) => {
        console.error('Error:', error);
         statusElement.textContent = 'Error generating reports. See console for details.';
         statusElement.style.backgroundColor = '#f8d7da'; // Light red for error
    });
    */

    // --- FRONTEND-ONLY SIMULATION ---
     console.warn("Backend report generation is simulated. PDF/Excel generation requires a server running lead156.py logic.");

    // Simulate successful report generation and show download links
     statusElement.textContent = 'Report generation simulated. See download section.';
     statusElement.style.backgroundColor = '#fff3cd'; // Light yellow for warning/simulation

    // Create dummy download links
     const dummyFiles = [
         { name: 'redistributed_hospitalist_data.csv', content: 'Dummy CSV Content' },
         { name: 'new_mrp_summary.xlsx', content: 'Dummy Excel Content' },
         { name: 'combined_patient_lists.pdf', content: 'Dummy PDF Content' },
         { name: 'combined_ward_lists.pdf', content: 'Dummy PDF Content' },
          { name: 'combined_last_week_mrp_lists.pdf', content: 'Dummy PDF Content' },
          { name: 'Distribution_Summary.pdf', content: 'Dummy PDF Content' },
     ];
     displayDownloadLinks(dummyFiles); // Show the dummy download links
});

// Initially hide output and download sections
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('output-section').classList.add('hidden');
    document.getElementById('download-section').classList.add('hidden');
});
