import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';

const PullRequestDetailPage = () => {
  const { prId } = useParams();

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Pull Request Details
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Details for PR ID: {prId}
        </Typography>
      </Box>
    </Container>
  );
};

export default PullRequestDetailPage;