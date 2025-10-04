import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';

const UserProfilePage = () => {
  const { userId } = useParams();

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          User Profile
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Profile for user ID: {userId}
        </Typography>
      </Box>
    </Container>
  );
};

export default UserProfilePage;