import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const PullRequestsPage = () => {
  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Pull Requests
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Pull request analytics and insights will be displayed here.
        </Typography>
      </Box>
    </Container>
  );
};

export default PullRequestsPage;