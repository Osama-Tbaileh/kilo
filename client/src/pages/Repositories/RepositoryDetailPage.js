import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';

const RepositoryDetailPage = () => {
  const { repoId } = useParams();

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Repository Details
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Details for repository ID: {repoId}
        </Typography>
      </Box>
    </Container>
  );
};

export default RepositoryDetailPage;