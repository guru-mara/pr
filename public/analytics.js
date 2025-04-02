// Analytics Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    document.getElementById('startDate').valueAsDate = thirtyDaysAgo;
    document.getElementById('endDate').valueAsDate = today;
    
    // Initialize the dashboard
    initializeVenueFilter();
    fetchAnalyticsData();
    setupEventListeners();
});

function setupEventListeners() {
    // Apply filters button
    document.getElementById('applyFiltersBtn').addEventListener('click', function() {
        fetchAnalyticsData();
    });
    
    // Reset filters button
    document.getElementById('resetFiltersBtn').addEventListener('click', function() {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        document.getElementById('startDate').valueAsDate = thirtyDaysAgo;
        document.getElementById('endDate').valueAsDate = today;
        document.getElementById('venueFilter').value = 'all';
        
        fetchAnalyticsData();
    });
    
    // Export report button
    document.getElementById('exportReportBtn').addEventListener('click', exportReport);
    
    // Analysis view filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Toggle active class
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Show the corresponding view
            const viewId = this.getAttribute('data-view');
            document.querySelectorAll('.analysis-view').forEach(view => view.classList.add('hidden'));
            document.getElementById(viewId + 'UtilizationView').classList.remove('hidden');
        });
    });
}

function initializeVenueFilter() {
    fetch('http://localhost:3004/api/venues')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('venueFilter');
            data.forEach(venue => {
                const option = document.createElement('option');
                option.value = venue.name;
                option.textContent = venue.name;
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error fetching venues:', error);
        });
}

function fetchAnalyticsData() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const venue = document.getElementById('venueFilter').value;
    
    // Show loading state
    showLoadingState();
    
    // Fetch analytics data from the API
    fetch(`http://localhost:3004/api/analytics?startDate=${startDate}&endDate=${endDate}&venue=${venue}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch analytics data');
            }
            return response.json();
        })
        .then(data => {
            updateDashboard(data);
        })
        .catch(error => {
            console.error('Error fetching analytics data:', error);
            
            // For demo purposes, load dummy data
            loadDummyData();
        });
}

function showLoadingState() {
    // Set loading indicators for metrics
    document.getElementById('totalBookings').textContent = '...';
    document.getElementById('utilizationRate').textContent = '...%';
    document.getElementById('mostUsedVenue').textContent = '...';
    document.getElementById('peakBookingTime').textContent = '...';
    
    // Clear tables
    document.getElementById('capacityTable').innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center">Loading...</td></tr>';
    document.getElementById('departmentTable').innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center">Loading...</td></tr>';
    document.getElementById('bookingHistoryTable').innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center">Loading...</td></tr>';
}

function updateDashboard(data) {
    // Update key metrics
    updateKeyMetrics(data.metrics);
    
    // Update charts
    createVenueUtilizationChart(data.venueUtilization);
    createDepartmentBookingsChart(data.departmentBookings);
    createBookingsTrendChart(data.bookingsTrend);
    createEquipmentUsageChart(data.equipmentUsage);
    createTimeDistributionChart(data.timeDistribution);
    
    // Update tables
    updateCapacityTable(data.capacityAnalysis);
    updateDepartmentTable(data.departmentAnalysis);
    updateBookingHistoryTable(data.bookingHistory);
}

function updateKeyMetrics(metrics) {
    document.getElementById('totalBookings').textContent = metrics.totalBookings;
    document.getElementById('utilizationRate').textContent = metrics.utilizationRate + '%';
    document.getElementById('mostUsedVenue').textContent = metrics.mostUsedVenue;
    document.getElementById('peakBookingTime').textContent = metrics.peakBookingTime;
    
    document.getElementById('bookingsTrend').textContent = metrics.bookingsTrend > 0 ? 
        `+${metrics.bookingsTrend}%` : `${metrics.bookingsTrend}%`;
    document.getElementById('bookingsTrend').className = metrics.bookingsTrend >= 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold';
    
    document.getElementById('utilizationTrend').textContent = metrics.utilizationTrend > 0 ? 
        `+${metrics.utilizationTrend}%` : `${metrics.utilizationTrend}%`;
    document.getElementById('utilizationTrend').className = metrics.utilizationTrend >= 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold';
    
    document.getElementById('mostUsedVenueBookings').textContent = `${metrics.mostUsedVenueBookings} bookings`;
    document.getElementById('peakTimePercentage').textContent = `${metrics.peakTimePercentage}% of bookings`;
}

function createVenueUtilizationChart(data) {
    const ctx = document.getElementById('venueUtilizationChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.venueUtilizationChart) {
        window.venueUtilizationChart.destroy();
    }
    
    window.venueUtilizationChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.venues,
            datasets: [{
                label: 'Utilization Rate (%)',
                data: data.rates,
                backgroundColor: 'rgba(79, 70, 229, 0.7)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Utilization (%)'
                    }
                }
            }
        }
    });
}

function createDepartmentBookingsChart(data) {
    const ctx = document.getElementById('departmentBookingsChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.departmentBookingsChart) {
        window.departmentBookingsChart.destroy();
    }
    
    window.departmentBookingsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.departments,
            datasets: [{
                data: data.bookings,
                backgroundColor: [
                    'rgba(79, 70, 229, 0.7)',
                    'rgba(52, 211, 153, 0.7)',
                    'rgba(251, 191, 36, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(59, 130, 246, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                }
            }
        }
    });
}

function createBookingsTrendChart(data) {
    const ctx = document.getElementById('bookingsTrendChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.bookingsTrendChart) {
        window.bookingsTrendChart.destroy();
    }
    
    window.bookingsTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Bookings',
                data: data.values,
                fill: false,
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 2,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Bookings'
                    }
                }
            }
        }
    });
}

function createEquipmentUsageChart(data) {
    const ctx = document.getElementById('equipmentUsageChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.equipmentUsageChart) {
        window.equipmentUsageChart.destroy();
    }
    
    window.equipmentUsageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.equipment,
            datasets: [{
                label: 'Usage Count',
                data: data.usageCount,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Usage Count'
                    }
                }
            }
        }
    });
}

function createTimeDistributionChart(data) {
    const ctx = document.getElementById('timeDistributionChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.timeDistributionChart) {
        window.timeDistributionChart.destroy();
    }
    
    window.timeDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.hours,
            datasets: [{
                label: 'Bookings',
                data: data.counts,
                backgroundColor: 'rgba(139, 92, 246, 0.7)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Bookings'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Hour of Day'
                    }
                }
            }
        }
    });
}

function updateCapacityTable(data) {
    const table = document.getElementById('capacityTable');
    table.innerHTML = '';
    
    if (data.length === 0) {
        table.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No data available</td></tr>';
        return;
    }
    
    data.forEach(item => {
        const efficiency = item.efficiency;
        let recommendationText = '';
        let recommendationClass = '';
        
        if (efficiency < 40) {
            recommendationText = 'Consider downsizing or repurposing';
            recommendationClass = 'text-red-600';
        } else if (efficiency < 60) {
            recommendationText = 'Room is underutilized';
            recommendationClass = 'text-yellow-600';
        } else if (efficiency < 80) {
            recommendationText = 'Good utilization';
            recommendationClass = 'text-green-600';
        } else {
            recommendationText = 'Consider expansion or additional rooms';
            recommendationClass = 'text-blue-600';
        }
        
        table.innerHTML += `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">${item.venue}</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.capacity}</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.avgAttendees}</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.efficiency}%</td>
                <td class="px-6 py-4 whitespace-nowrap ${recommendationClass}">${recommendationText}</td>
            </tr>
        `;
    });
}

function updateDepartmentTable(data) {
    const table = document.getElementById('departmentTable');
    table.innerHTML = '';
    
    if (data.length === 0) {
        table.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No data available</td></tr>';
        return;
    }
    
    data.forEach(item => {
        table.innerHTML += `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">${item.department}</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.totalBookings}</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.mostUsedVenue}</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.avgDuration} mins</td>
                <td class="px-6 py-4 whitespace-nowrap">${item.peakTime}</td>
            </tr>
        `;
    });
}

function updateBookingHistoryTable(data) {
    const table = document.getElementById('bookingHistoryTable');
    table.innerHTML = '';
    
    if (data.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No bookings found</td></tr>';
        return;
    }
    
    data.forEach(booking => {
        // Format date and time
        const date = new Date(booking.date);
        const formattedDate = date.toLocaleDateString();
        const formattedTime = booking.time;
        
        // Format equipment list
        let equipment = [];
        if (booking.projectorRequired) equipment.push('Projector');
        if (booking.speakerRequired) equipment.push('Speaker System');
        const equipmentText = equipment.length > 0 ? equipment.join(', ') : 'None';
        
        table.innerHTML += `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">${formattedDate} ${formattedTime}</td>
                <td class="px-6 py-4 whitespace-nowrap">${booking.title}</td>
                <td class="px-6 py-4 whitespace-nowrap">${booking.venue}</td>
                <td class="px-6 py-4 whitespace-nowrap">${booking.department || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap">${booking.attendees || 'Unknown'}</td>
                <td class="px-6 py-4 whitespace-nowrap">${equipmentText}</td>
            </tr>
        `;
    });
}

function exportReport() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const venue = document.getElementById('venueFilter').value;
    const venueName = venue === 'all' ? 'All Venues' : venue;
    
    // Create export window with formatted data
    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Venue Analytics Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #4F46E5; }
                h2 { color: #4B5563; margin-top: 30px; }
                table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                th, td { border: 1px solid #E5E7EB; padding: 12px; text-align: left; }
                th { background-color: #F3F4F6; }
                .summary-stats { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; }
                .stat-card { border: 1px solid #E5E7EB; padding: 15px; border-radius: 8px; min-width: 200px; }
                .stat-title { font-size: 14px; color: #6B7280; margin-bottom: 5px; }
                .stat-value { font-size: 24px; font-weight: bold; color: #111827; }
            </style>
        </head>
        <body>
            <h1>Venue Analytics Report</h1>
            <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
            <p><strong>Venue:</strong> ${venueName}</p>
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
            
            <h2>Summary Statistics</h2>
            <div class="summary-stats">
                <div class="stat-card">
                    <div class="stat-title">Total Bookings</div>
                    <div class="stat-value">${document.getElementById('totalBookings').textContent}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Utilization Rate</div>
                    <div class="stat-value">${document.getElementById('utilizationRate').textContent}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Most Used Venue</div>
                    <div class="stat-value">${document.getElementById('mostUsedVenue').textContent}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Peak Booking Time</div>
                    <div class="stat-value">${document.getElementById('peakBookingTime').textContent}</div>
                </div>
            </div>
            
            <h2>Capacity Utilization Analysis</h2>
            <table>
                <thead>
                    <tr>
                        <th>Venue</th>
                        <th>Capacity</th>
                        <th>Avg. Attendees</th>
                        <th>Efficiency</th>
                        <th>Recommendation</th>
                    </tr>
                </thead>
                <tbody>
                    ${document.getElementById('capacityTable').innerHTML}
                </tbody>
            </table>
            
            <h2>Department Analysis</h2>
            <table>
                <thead>
                    <tr>
                        <th>Department</th>
                        <th>Total Bookings</th>
                        <th>Most Used Venue</th>
                        <th>Avg. Booking Duration</th>
                        <th>Peak Booking Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${document.getElementById('departmentTable').innerHTML}
                </tbody>
            </table>
            
            <h2>Booking History</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Title</th>
                        <th>Venue</th>
                        <th>Department</th>
                        <th>Attendees</th>
                        <th>Equipment</th>
                    </tr>
                </thead>
                <tbody>
                    ${document.getElementById('bookingHistoryTable').innerHTML}
                </tbody>
            </table>
            
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `);
    reportWindow.document.close();
}

// For development purposes - load dummy data when API is not available
function loadDummyData() {
    const data = {
        metrics: {
            totalBookings: 157,
            utilizationRate: 68.5,
            mostUsedVenue: "Conference Room A",
            peakBookingTime: "10:00 AM",
            bookingsTrend: 12.3,
            utilizationTrend: 5.7,
            mostUsedVenueBookings: 42,
            peakTimePercentage: 22
        },
        venueUtilization: {
            venues: ["Conference Room A", "Conference Room B", "Auditorium", "Meeting Room 1", "Meeting Room 2"],
            rates: [85.2, 72.8, 54.3, 68.7, 61.5]
        },
        departmentBookings: {
            departments: ["Administration", "Faculty", "Student", "Clubs", "IT Services", "Other"],
            bookings: [42, 35, 28, 22, 18, 12]
        },
        bookingsTrend: {
            labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
            values: [32, 45, 38, 42]
        },
        equipmentUsage: {
            equipment: ["Projector", "Speaker System"],
            usageCount: [87, 52]
        },
        timeDistribution: {
            hours: ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"],
            counts: [8, 15, 22, 18, 12, 14, 19, 16, 11, 5]
        },
        capacityAnalysis: [
            {venue: "Conference Room A", capacity: "50", avgAttendees: 42, efficiency: 84},
            {venue: "Conference Room B", capacity: "30", avgAttendees: 22, efficiency: 73},
            {venue: "Auditorium", capacity: "200", avgAttendees: 108, efficiency: 54},
            {venue: "Meeting Room 1", capacity: "15", avgAttendees: 10, efficiency: 67},
            {venue: "Meeting Room 2", capacity: "20", avgAttendees: 12, efficiency: 60}
        ],
        departmentAnalysis: [
            {department: "Administration", totalBookings: 42, mostUsedVenue: "Conference Room A", avgDuration: 60, peakTime: "10:00 AM"},
            {department: "Faculty", totalBookings: 35, mostUsedVenue: "Meeting Room 1", avgDuration: 90, peakTime: "2:00 PM"},
            {department: "Student", totalBookings: 28, mostUsedVenue: "Auditorium", avgDuration: 120, peakTime: "3:00 PM"},
            {department: "Clubs", totalBookings: 22, mostUsedVenue: "Meeting Room 2", avgDuration: 75, peakTime: "4:00 PM"},
            {department: "IT Services", totalBookings: 18, mostUsedVenue: "Conference Room B", avgDuration: 45, peakTime: "11:00 AM"}
        ],
        bookingHistory: [
            {date: "2023-11-15", time: "10:00 AM", title: "Executive Meeting", venue: "Conference Room A", department: "Administration", attendees: 12, projectorRequired: true, speakerRequired: false},
            {date: "2023-11-14", time: "2:00 PM", title: "Faculty Workshop", venue: "Meeting Room 1", department: "Faculty", attendees: 8, projectorRequired: true, speakerRequired: true},
            {date: "2023-11-13", time: "3:00 PM", title: "Student Orientation", venue: "Auditorium", department: "Student", attendees: 150, projectorRequired: true, speakerRequired: true},
            {date: "2023-11-12", time: "4:00 PM", title: "Chess Club Meeting", venue: "Meeting Room 2", department: "Clubs", attendees: 10, projectorRequired: false, speakerRequired: false},
            {date: "2023-11-11", time: "11:00 AM", title: "IT Training", venue: "Conference Room B", department: "IT Services", attendees: 15, projectorRequired: true, speakerRequired: false}
        ]
    };
    
    updateDashboard(data);
}