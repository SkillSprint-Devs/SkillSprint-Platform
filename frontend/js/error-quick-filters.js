// Quick date filters and clear filters functionality

function setupQuickFilters() {
    // Quick date filter buttons
    document.querySelectorAll('.quick-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const range = e.target.dataset.range;

            // Remove active class from all
            document.querySelectorAll('.quick-filter-btn').forEach(b => {
                b.style.background = '#fff';
                b.style.color = '#333';
                b.classList.remove('active');
            });

            // Add active class to clicked button
            e.target.classList.add('active');
            e.target.style.background = 'var(--accent)';
            e.target.style.color = '#1A1A1A';

            const now = new Date();
            let startDate, endDate, rangeText;

            switch (range) {
                case 'today':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    endDate = new Date(now.setHours(23, 59, 59, 999));
                    rangeText = 'Today';
                    break;
                case '7days':
                    startDate = new Date(now.setDate(now.getDate() - 7));
                    endDate = new Date();
                    rangeText = 'Last 7 Days';
                    break;
                case '30days':
                    startDate = new Date(now.setDate(now.getDate() - 30));
                    endDate = new Date();
                    rangeText = 'Last 30 Days';
                    break;
                default: // 'all'
                    startDate = null;
                    endDate = null;
                    rangeText = 'All time';
            }

            // Update date inputs
            if (startDate) {
                document.getElementById('filterStartDate').value = startDate.toISOString().split('T')[0];
            } else {
                document.getElementById('filterStartDate').value = '';
            }

            if (endDate) {
                document.getElementById('filterEndDate').value = endDate.toISOString().split('T')[0];
            } else {
                document.getElementById('filterEndDate').value = '';
            }

            // Update active range text
            document.getElementById('activeDateRange').textContent = `Showing: ${rangeText}`;

            // Update filter count
            updateFilterCount();

            // Reload errors
            currentPage = 1;
            loadErrors();
        });
    });

    // Clear filters button
    document.getElementById('clearFilters').addEventListener('click', () => {
        // Reset all filters
        document.getElementById('filterType').value = '';
        document.getElementById('filterSeverity').value = '';
        document.getElementById('filterResolved').value = '';
        document.getElementById('filterStartDate').value = '';
        document.getElementById('filterEndDate').value = '';
        document.getElementById('searchInput').value = '';

        // Reset quick filter buttons
        document.querySelectorAll('.quick-filter-btn').forEach(b => {
            b.style.background = '#fff';
            b.style.color = '#333';
            b.classList.remove('active');
        });

        // Activate "All Time" button
        const allTimeBtn = document.querySelector('.quick-filter-btn[data-range="all"]');
        if (allTimeBtn) {
            allTimeBtn.classList.add('active');
            allTimeBtn.style.background = 'var(--accent)';
            allTimeBtn.style.color = '#1A1A1A';
        }

        // Update active range text
        document.getElementById('activeDateRange').textContent = 'Showing: All time';

        // Update filter count
        updateFilterCount();

        // Reload errors
        currentPage = 1;
        loadErrors();
    });
}

function updateFilterCount() {
    let count = 0;

    if (document.getElementById('filterType').value) count++;
    if (document.getElementById('filterSeverity').value) count++;
    if (document.getElementById('filterResolved').value) count++;
    if (document.getElementById('filterStartDate').value) count++;
    if (document.getElementById('filterEndDate').value) count++;
    if (document.getElementById('searchInput').value) count++;

    const badge = document.getElementById('filterCount');
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}
