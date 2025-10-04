import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const SettingsPage = () => {
  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Application settings and configuration will be displayed here.
        </Typography>
      </Box>
    </Container>
  );
};

export default SettingsPage;