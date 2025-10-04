import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const MetricsPage = () => {
  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Metrics & Analytics
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Team metrics and performance analytics will be displayed here.
        </Typography>
      </Box>
    </Container>
  );
};

export default MetricsPage;